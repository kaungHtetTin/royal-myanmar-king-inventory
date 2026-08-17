<?php

namespace App\Enums;

enum FinancialTransactionType: string
{
    case CashSale = 'cash_sale';
    case CashSaleVoid = 'cash_sale_void';
    case CreditSale = 'credit_sale';
    case CreditSaleVoid = 'credit_sale_void';
    case CashSubmissionConfirmed = 'cash_submission_confirmed';
    case CashSubmissionReversed = 'cash_submission_reversed';
    case CustomerPayment = 'customer_payment';
    case CustomerPaymentVoid = 'customer_payment_void';
}
