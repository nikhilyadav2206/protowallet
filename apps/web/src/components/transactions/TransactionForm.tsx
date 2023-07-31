import React, { useState } from 'react';
import DatePickerSingle from '../shared/DatepickerSingle';
import Select from 'react-select';
import { Account, Amount, Category, Label, Transaction, TransferTransaction } from '@protowallet/types';
import { CreateTransactionOptions, UpdateTransactionOptions } from '@protowallet/core/dist/repositories';
import { Currency, RecordDirection, RecordType } from '@protowallet/lookups';
import { OkCancelAction } from '../../constants/enums';
import { CreateTransferTxnOption } from '@protowallet/core/dist/services';

export type TransactionFormProps = {
  transaction?: Transaction;
  updateFn?: (options: UpdateTransactionOptions) => void;
  createFn?: (options: CreateTransactionOptions) => void;
  transferFn?: (options: CreateTransferTxnOption) => void;

  accounts: Account[];
  labels: Label[];
  categories: Category[];

  actionCompleteFn?: (actionPerformed: OkCancelAction, transaction?: Transaction) => void;
};

function itemToSelectApi<T>(item: T, labelKey: string): SelectApi<T> {
  return {
    value: item,
    label: item[labelKey],
  };
}

export type SelectApi<T> = {
  value: T;
  label: keyof T;
};

const getAmount = (amountRaw: number, type: RecordType): Amount => {
  return {
    value: Math.abs(amountRaw),
    direction: type == RecordType.Income ? RecordDirection.Right : RecordDirection.Left,
    currency: Currency.INR,
  };
};

export default function TransactionForm(props: TransactionFormProps) {
  // Options Data
  const accountsAvailable = props.accounts.map((acc) => itemToSelectApi(acc, 'name'));
  const labelsAvailable = props.labels.map((label) => itemToSelectApi(label, 'value'));
  const categoriesAvailable = props.categories.map((category) => itemToSelectApi(category, 'title'));

  const isUpdating = props.transaction !== undefined;
  const transaction = props.transaction;

  // Form Bindings

  const [category, setCategory] = useState<SelectApi<Category> | null>(
    categoriesAvailable.find((ctg) => ctg.value.id == transaction?.category) || null,
  );
  const [labels, setLabels] = useState<readonly SelectApi<Label>[] | null>(
    labelsAvailable.filter((l) => transaction?.labels.includes(l.value.id)) || null,
  );
  const [account, setAccount] = useState<SelectApi<Account> | null>(accountsAvailable.find((acc) => acc.value.id == transaction?.accountId) || null);

  const [title, setTitle] = useState(transaction?.title || '');
  const [amountRaw, setAmountRaw] = useState<number>(transaction?.amount.value || 0);
  const [recordType, setRecordType] = useState<RecordType>(transaction?.type || RecordType.Expense);
  const [note, setNote] = useState(transaction?.note || '');
  const [selectedDates, setSelectedDates] = useState<Date[]>([transaction?.createdAt || new Date()]);

  // Transfer Specific Bindings
  const [fromAccount, setFromAccount] = useState<SelectApi<Account> | null>(null);
  const [toAccount, setToAccount] = useState<SelectApi<Account> | null>(null);

  const saveTxn = () => {
    if (isUpdating) {
      props.updateFn &&
        props.updateFn({
          id: transaction?.id || 0,
          title,
          amount: getAmount(amountRaw, recordType),
          type: recordType,
          note,
          createdAt: selectedDates[0],
          accountId: account?.value.id || 0,
          category: category?.value.id || 0,
          labels: labels?.map((l) => l.value.id) || [],
        });
    } else {
      if (recordType == RecordType.Transfer) {
        props.transferFn &&
          props.transferFn({
            title,
            amountRaw: Math.abs(amountRaw),
            currency: Currency.INR,
            note,
            createdAt: selectedDates[0],
            fromAccountId: fromAccount?.value.id || 0,
            toAccountId: toAccount?.value.id || 0,
            category: category?.value.id || 0,
            labels: labels?.map((l) => l.value.id) || [],
          });
      } else {
        props.createFn &&
          props.createFn({
            title,
            amount: getAmount(amountRaw, recordType),
            type: recordType,
            note,
            createdAt: selectedDates[0],
            accountId: account?.value.id || 0,
            category: category?.value.id || 0,
            labels: labels?.map((l) => l.value.id) || [],
          });
      }
    }
    props.actionCompleteFn && props.actionCompleteFn(OkCancelAction.Ok);
  };

  return (
    <div className="px-5 py-4">
      <form className="space-y-3" onSubmit={saveTxn}>
        {/* Start Group BUtton */}
        <div className="flex flex-wrap justify-center items-center -space-x-px">
          <button
            className={`btn border-slate-200 hover text-slate-600 rounded-none first:rounded-l last:rounded-r ${
              recordType == RecordType.Expense && 'bg-red-500 text-white'
            } `}
            onClick={(e) => {
              e.preventDefault();
              setRecordType(RecordType.Expense);
            }}
          >
            Expense
          </button>
          {!isUpdating && (
            <button
              className={`btn border-slate-200 hover text-slate-600 rounded-none first:rounded-l last:rounded-r ${
                recordType == RecordType.Transfer && 'bg-primary-500 text-white'
              } `}
              onClick={(e) => {
                e.preventDefault();
                setRecordType(RecordType.Transfer);
              }}
            >
              Transfer
            </button>
          )}
          <button
            className={`btn border-slate-200 hover text-slate-600 rounded-none first:rounded-l last:rounded-r ${
              recordType == RecordType.Income && 'bg-green-500 text-white'
            } `}
            onClick={(e) => {
              e.preventDefault();
              setRecordType(RecordType.Income);
            }}
          >
            Income
          </button>
        </div>
        <label className="block text-sm font-medium mb-1" htmlFor="title">
          Title <span className="text-rose-500">*</span>
        </label>
        <input
          id="title"
          className="form-input w-full px-2 py-1"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
        <label className="block text-sm font-medium mb-1" htmlFor="amountRaw">
          Amount <span className="text-rose-500">*</span>
        </label>
        <input
          id="amountRaw"
          className="form-input w-full px-2 py-1"
          type="number"
          value={amountRaw}
          min={0}
          onChange={(e) => {
            setAmountRaw(parseInt(e.target.value));
          }}
        />
        {!(recordType == RecordType.Transfer) && (
          <>
            <label className="block text-sm font-medium mb-1">
              Account <span className="text-rose-500">*</span>
            </label>
            <Select options={accountsAvailable} value={account} onChange={setAccount} />
          </>
        )}
        {recordType == RecordType.Transfer && (
          <>
            <label className="block text-sm font-medium mb-1">
              From Account <span className="text-rose-500">*</span>
            </label>
            <Select options={accountsAvailable} value={fromAccount} onChange={setFromAccount} />
            <label className="block text-sm font-medium mb-1">
              To Account <span className="text-rose-500">*</span>
            </label>
            <Select options={accountsAvailable} value={toAccount} onChange={setToAccount} />
          </>
        )}
        <label className="block text-sm font-medium mb-1">
          Category <span className="text-rose-500">*</span>
        </label>
        <Select options={categoriesAvailable} value={category} onChange={setCategory} />
        <label className="block text-sm font-medium mb-1">
          Label <span className="text-rose-500">*</span>
        </label>
        <Select options={labelsAvailable} value={labels} isMulti onChange={setLabels} />
        <label className="block text-sm font-medium mb-1">
          Transaction Date <span className="text-rose-500">*</span>
        </label>
        <DatePickerSingle setSelectedDate={setSelectedDates} />

        <label className="block text-sm font-medium mb-1" htmlFor="note">
          Note <span className="text-rose-500">*</span>
        </label>
        <textarea
          id="note"
          className="form-textarea w-full px-2 py-1"
          rows={4}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        ></textarea>

        <div className="flex flex-wrap justify-end space-x-2">
          {props.actionCompleteFn && (
            <button
              className="btn-sm border-slate-200 hover:border-slate-300 text-slate-600"
              onClick={(e) => {
                e.preventDefault();
                props.actionCompleteFn && props.actionCompleteFn(OkCancelAction.Cancel);
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="btn-sm bg-primary-500 hover:bg-primary-600 text-white"
            onClick={(e) => {
              e.preventDefault();
              saveTxn();
            }}
          >
            {isUpdating ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
