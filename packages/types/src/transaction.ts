import { Currency, RecordType } from '@protowallet/lookups';
import { GeneralTimestamedEntity, IdEntity, RecurringEntity } from './base';
import { Amount } from './general';

export type Transaction = {
  accountId: number;
  title: string;
  type: RecordType;
  category: number;
  amount: Amount;
  note?: string;
  labels: number[];

  isRecurringTransaction: boolean;
} & IdEntity & GeneralTimestamedEntity;

export type RecurringTransaction = {
  accountId: number;
  title: string;
  type: RecordType;
  category: number;
  amount: Amount;
  labels: number[];
} & RecurringEntity & IdEntity & GeneralTimestamedEntity;

export type TransferTransaction = Omit<Transaction, 'accountId' | 'type' | 'amount'> & {
  fromAccountId: number;
  toAccountId: number;
  amountRaw: number;
  currency: Currency;
}