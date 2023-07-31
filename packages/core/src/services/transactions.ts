import {
  Account,
  Amount,
  Category,
  GeneralTimestamedEntity,
  IdEntity,
  Label,
  RecurringTransaction,
  Transaction,
} from '@protowallet/types';
import { Entities } from '../entities-lookup';
import {
  AccountRepository,
  CategoryRepository,
  CreateTransactionOptions,
  FindTransactionsOptions,
  LabelRepository,
  RecurringTransactionRepository,
  Repository,
  TransactionRepository,
} from '../repositories';
import { RepositoryProvider } from '../repository-provider';
import { Currency, RecordDirection, RecordType } from '@protowallet/lookups';
import { RecurringEntityFlattener, RecurringEntityToFlatMapper } from './recurring-entity';
import { klass } from '@protowallet/common';


export type CreateTransferTxnOption = Omit<CreateTransactionOptions, 'accountId' | 'type' | 'amount'> & {
  fromAccountId: number;
  toAccountId: number;
  amountRaw: number;
  currency: Currency;
};

export class TransactionsManager {
  private transactionRepository: TransactionRepository;
  private recurringTransactionRepository: RecurringTransactionRepository;

  private recurringEntityFlattener: RecurringEntityFlattener;
  private recurringTransactionNote = '----\nAutogenerated by Protowallet.\n---';

  private recurringToTransactionLogic = (recurringTransaction: RecurringTransaction, timestamp: Date, index: number): Transaction => ({
    id: recurringTransaction.id * 1000 + index,
    accountId: recurringTransaction.accountId,
    title: recurringTransaction.title,
    type: recurringTransaction.type,
    category: recurringTransaction.category,
    amount: recurringTransaction.amount,
    note: this.recurringTransactionNote,
    labels: recurringTransaction.labels,
    createdAt: timestamp,
    isRecurringTransaction: true,
  });

  constructor(repositoriesProvider: RepositoryProvider, recurringEntityFlattener: RecurringEntityFlattener) {
    this.transactionRepository = repositoriesProvider(Entities.Transaction) as TransactionRepository;
    this.recurringTransactionRepository = repositoriesProvider(Entities.RecurringTransaction) as RecurringTransactionRepository;
    this.recurringEntityFlattener = recurringEntityFlattener;
  }

  async query(options: FindTransactionsOptions): Promise<Transaction[]> {
    const transactions: Transaction[] = await this.transactionRepository.query(options);
    const recurringTransactions: RecurringTransaction[] = await this.recurringTransactionRepository.query(options);
    const flattenedRecurringTransactions: Transaction[] = await this.recurringEntityFlattener.flattenEntities<Transaction>(recurringTransactions, {
      toFlatMapper: this.recurringToTransactionLogic as RecurringEntityToFlatMapper<Transaction>,
      dateRange: options.dateRange,
    });
    const allTransactions = [...transactions, ...flattenedRecurringTransactions];
    allTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return allTransactions;
  }

  populateTransferTransaction(transaction: CreateTransferTxnOption): [CreateTransactionOptions, CreateTransactionOptions] {
    return [
      {
        accountId: transaction.fromAccountId,
        type: RecordType.Transfer,
        amount: {
          value: transaction.amountRaw,
          currency: transaction.currency,
          direction: RecordDirection.Left,
        },
        ...transaction,
      },
      {
        accountId: transaction.toAccountId,
        type: RecordType.Transfer,
        amount: {
          value: transaction.amountRaw,
          currency: transaction.currency,
          direction: RecordDirection.Right,
        },
        ...transaction,
      },
    ];
  }
}

export class TransactionAggregationsService {
  // Aggregations
  async aggregateTransactionsAmount(transactions: Transaction[], initialBalance: number = 0): Promise<Amount> {
    let currentBalance = initialBalance;
    for (let index = 0; index < transactions.length; index++) {
      const transaction = transactions[index];
      switch (transaction.amount.direction) {
        case RecordDirection.Right:
          currentBalance += transaction.amount.value;
          break;
        case RecordDirection.Left:
          currentBalance -= transaction.amount.value;
          break;
      }
    }
    if (currentBalance < 0) {
      return {
        direction: RecordDirection.Left,
        value: currentBalance * -1,
        currency: Currency.INR,
      };
    } else {
      return {
        direction: RecordDirection.Right,
        value: currentBalance,
        currency: Currency.INR,
      };
    }
  }

  async aggregateTransactionsPerDay(dates: klass.TimelessDate[], transactions: Transaction[]): Promise<Map<klass.TimelessDate, Transaction[]>> {
    const timelessDateRegister: Map<string, klass.TimelessDate> = new Map();
    dates.forEach((d) => timelessDateRegister.set(d.toString(), d));

    const finalMap: Map<klass.TimelessDate, Transaction[]> = new Map();
    dates.forEach((d) => finalMap.set(d, []));

    for (let index = 0; index < transactions.length; index++) {
      const transaction = transactions[index];
      const key = new klass.TimelessDate(transaction.createdAt).toString();
      const providedTimelessDate = timelessDateRegister.get(key) as klass.TimelessDate;
      const registry = finalMap.get(providedTimelessDate) as Transaction[];
      registry.push(transaction);
    }

    return finalMap;
  }

  async aggregateTransactionAmountPerDay(dates: klass.TimelessDate[], transactions: Transaction[]): Promise<Map<klass.TimelessDate, Amount>> {
    const transactionsPerDay = await this.aggregateTransactionsPerDay(dates, transactions);
    const data: Map<klass.TimelessDate, Amount> = new Map();
    for (let key of transactionsPerDay.keys()) {
      const transactions = transactionsPerDay.get(key) as Transaction[];
      const aggregatedAmount = await this.aggregateTransactionsAmount(transactions);
      data.set(key, aggregatedAmount);
    }
    return data;
  }

  async aggregateTransactionsGroupAmount(
    transactionsMap: Map<number, Transaction[]>,
    initialAmountFn?: (t: number) => number,
  ): Promise<Map<number, Amount>> {
    const data: Map<number, Amount> = new Map();
    for (let key of transactionsMap.keys()) {
      const transactions = transactionsMap.get(key) as Transaction[];
      const initialAmount = initialAmountFn ? initialAmountFn(key) : 0;
      const aggregatedAmount = await this.aggregateTransactionsAmount(transactions, initialAmount);
      data.set(key, aggregatedAmount);
    }
    return data;
  }
}

export class TransactionsGroupingService {
  private categoryRepository: CategoryRepository;
  private labelRepository: LabelRepository;
  private accountRepository: AccountRepository;

  constructor(repositoriesProvider: RepositoryProvider) {
    this.categoryRepository = repositoriesProvider(Entities.Category) as CategoryRepository;
    this.labelRepository = repositoriesProvider(Entities.Label) as LabelRepository;
    this.accountRepository = repositoriesProvider(Entities.Account) as AccountRepository;
  }

  // Groupings
  async groupTransactions_Categorywise(transactions: Transaction[]): Promise<Map<number, Transaction[]>> {
    return this._groupTransactions<Category>(transactions, this.categoryRepository, 'category');
  }

  async groupTransactions_Labelwise(transactions: Transaction[]): Promise<Map<number, Transaction[]>> {
    return this._groupTransactions<Label>(transactions, this.labelRepository, 'labels');
  }

  async groupTransactions_Accountwise(transactions: Transaction[]): Promise<Map<number, Transaction[]>> {
    return this._groupTransactions<Account>(transactions, this.accountRepository, 'accountId');
  }

  protected async _groupTransactions<T extends IdEntity & GeneralTimestamedEntity>(
    transactions: Transaction[],
    repository: Repository<T>,
    idLookupKey: keyof Transaction,
  ): Promise<Map<number, Transaction[]>> {
    const grouping: Map<number, Transaction[]> = new Map();
    const data: Record<number, T> = repository.getAllRecord();

    for (let index = 0; index < transactions.length; index++) {
      const transaction = transactions[index];
      const entity = data[transaction[idLookupKey] as number];
      const exisitingTransactions = grouping.get(entity.id) || [];
      exisitingTransactions.push(transaction);
      grouping.set(entity.id, exisitingTransactions);
    }

    for (let key of Object.keys(data)) {
      const entity = data[parseInt(key)];
      if (!grouping.has(entity.id)) {
        grouping.set(entity.id, []);
      }
    }

    return grouping;
  }
}
