<?php

namespace Tests\Unit\Support;

use App\Support\Csv;
use Tests\TestCase;

class CsvTest extends TestCase
{
    public function test_it_prefixes_cells_that_start_a_formula(): void
    {
        // The payload an export must neutralise: a spreadsheet runs these on
        // open. The leading quote makes it text and is not displayed.
        $this->assertSame("'=HYPERLINK(\"http://evil\",\"Klik\")", Csv::cell('=HYPERLINK("http://evil","Klik")'));
        $this->assertSame("'+1+1", Csv::cell('+1+1'));
        $this->assertSame("'-1+1", Csv::cell('-1+1'));
        $this->assertSame("'@SUM(A1)", Csv::cell('@SUM(A1)'));
        $this->assertSame("'\tcmd", Csv::cell("\tcmd"));
        $this->assertSame("'\rcmd", Csv::cell("\rcmd"));
    }

    public function test_it_leaves_ordinary_strings_alone(): void
    {
        $this->assertSame('INV-20260929-ABCDEF', Csv::cell('INV-20260929-ABCDEF'));
        $this->assertSame('Budi Santoso', Csv::cell('Budi Santoso'));
        $this->assertSame('', Csv::cell(''));
    }

    public function test_it_never_touches_non_strings(): void
    {
        // Numeric columns are cast to int at the call site and must stay
        // numeric — including a genuine negative figure.
        $this->assertSame(1500, Csv::cell(1500));
        $this->assertSame(-1500, Csv::cell(-1500));
        $this->assertSame(0, Csv::cell(0));
        $this->assertNull(Csv::cell(null));
        $this->assertSame(1.5, Csv::cell(1.5));
        $this->assertTrue(Csv::cell(true));
    }

    public function test_row_sanitises_every_cell_in_order(): void
    {
        $this->assertSame(
            ['INV-1', "'=1+1", 20000, "'@x"],
            Csv::row(['INV-1', '=1+1', 20000, '@x']),
        );
    }
}
