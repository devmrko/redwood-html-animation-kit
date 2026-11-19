"""No model calls: ensure a live smoke run checks row/column meaning, not tokens."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from smoke_ai_connections import check_table


class LiveSmokeTest(unittest.TestCase):
    def page(self,rows,classes='rf-comparison-table rf-comparison-table--compact'):
        return {'html':'<table class="'+classes+'">'+''.join('<tr>'+''.join('<td>'+cell+'</td>' for cell in row)+'</tr>' for row in rows)+'</table>','duration':4,'effects':[]}
    def test_exact_table_and_nested_text_are_accepted(self):
        check_table(self.page([['항목','수량'],['<span>A</span>','10'],[' B ','20'],['C','30']]))
    def test_all_numbers_in_wrong_columns_are_rejected(self):
        for rows in [[['항목','수량'],['원본 항목 1','A/10'],['원본 항목 2','B/20'],['원본 항목 3','C/30']],
                     [['항목','수량'],['A','20'],['B','10'],['C','30']]]:
            with self.assertRaises(ValueError):check_table(self.page(rows))
    def test_class_names_as_text_and_wrong_timing_are_rejected(self):
        rows=[['항목','수량'],['A','10'],['B','20'],['C','30']]
        with self.assertRaises(ValueError):check_table(self.page(rows,classes=''))
        page=self.page(rows);page['duration']=8
        with self.assertRaises(ValueError):check_table(page)


if __name__=='__main__':unittest.main()
