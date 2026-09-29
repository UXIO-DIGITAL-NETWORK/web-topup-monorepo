<?php

declare(strict_types=1);

namespace App\Support;

/**
 * CSV export safety.
 *
 * Excel, LibreOffice and Google Sheets evaluate a cell as a formula when it
 * begins with `=`, `+`, `-` or `@` (and, in Excel, a leading tab or carriage
 * return). A customer-supplied value is therefore live code to a spreadsheet:
 * a guest who types `=HYPERLINK("http://evil","Klik")` as their contact, or a
 * member who sets that as their display name, has written a formula an operator
 * runs simply by opening the export.
 *
 * `fputcsv()` does not help — it quotes only for the delimiter, enclosure and
 * newline, and passes a leading `=` straight through. So every export writes
 * its cells through here.
 *
 * The mitigation is the conventional one: prefix the value with a single quote,
 * which the spreadsheet reads as "this cell is text" and does not display.
 * Non-string cells are returned untouched, so numeric columns — which call
 * sites cast to int — stay numeric and a genuine negative number is unaffected.
 */
final class Csv
{
    /** A leading one of these makes a spreadsheet treat the cell as a formula. */
    private const DANGEROUS_LEADING = ['=', '+', '-', '@', "\t", "\r"];

    /**
     * Neutralise one cell. Only a string can carry a formula, so ints, floats,
     * bools and null pass through unchanged.
     */
    public static function cell(mixed $value): mixed
    {
        if (! is_string($value) || $value === '') {
            return $value;
        }

        if (in_array($value[0], self::DANGEROUS_LEADING, true)) {
            return "'".$value;
        }

        return $value;
    }

    /**
     * Neutralise a whole row, for `fputcsv($out, Csv::row([...]))`.
     *
     * @param  array<int, mixed>  $cells
     * @return array<int, mixed>
     */
    public static function row(array $cells): array
    {
        return array_map([self::class, 'cell'], $cells);
    }
}
