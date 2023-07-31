import { Account } from '@protowallet/types';
import { AbstractRepositoryAdapter } from './base';
import { EntityNotFoundException, EntityNotValidException, config, utils } from '@protowallet/common';
import { RecordDirection } from '@protowallet/lookups';
import { PrefsProvider } from '../services/prefs-manager';

export type CreateAccountOptions = Omit<Partial<Account>, 'id' | 'createdAt'> & {
  name: string;
};

export type UpdateAccountOptions = Omit<Partial<Account>, 'createdAt'> & {
  id: number;
};

export class AccountRepository extends AbstractRepositoryAdapter<Account> {
  constructor(feed: Collection<Account>, prefs: PrefsProvider) {
    super(feed, prefs);
  }

  async create(options: CreateAccountOptions): Promise<Account> {
    const index = options.index || (await this.count()) + 1;
    const account: Account = {
      id: utils.generateRandomId(),
      name: options.name,
      index: index,
      accent: options.accent || 1,
      initialBalance: options.initialBalance || { value: 0, currency: this.prefsProvider.getPreferredCurrency(), direction: RecordDirection.Right },
      createdAt: new Date(),
    };

    return this._save(account);
  }

  async update(options: UpdateAccountOptions): Promise<Account> {
    const account = await this.get(options.id);
    if (!account) {
      throw EntityNotFoundException('Account', options.id);
    }
    account.name = options.name || account.name;
    account.accent = options.accent || account.accent;

    return this._update(account);
  }

  /**
   * Donot trigger this method directly. A workflow (delete transactions, cleanup, etc.) should be followed to delete an account.
   */
  async delete(id: number): Promise<void> {
    super.delete(id);
  }

  async validate(account: Account): Promise<void> {
    const case1 = !!(account.id && account.id > 0);
    const case2 = !!(account.name && account.name.length > 0);
    const case3 = !!(account.index >= 0);
    const case4 = !!(account.initialBalance && account.initialBalance.value >= 0);
    const case5 = !!(account.accent && account.accent > 0 && account.accent <= config.TOTAL_ACCENTS);
    const isValid = case1 && case2 && case3 && case4 && case5;
    if (!isValid) {
      throw EntityNotValidException('Account', account);
    }
  }
}
