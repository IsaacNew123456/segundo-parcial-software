# -*- coding: utf-8 -*-
import docx
from docx.shared import Pt, Inches, RGBColor
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

from generate_cu_docx import CASOS_DE_USO, DXA_COL0, DXA_COL1, FILL_HEADER_LEFT, set_cell_props, set_table_borders_and_margins

def update_master_document(doc_path='1er Examen Parcial - DiagramadorUML_ACTUALIZADO.docx'):
    doc = docx.Document(doc_path)
    
    # Tables 18 to 26 correspond to CU13 to CU21
    for cu_idx, cu in enumerate(CASOS_DE_USO):
        table_idx = 18 + cu_idx
        if table_idx >= len(doc.tables):
            break
        table = doc.tables[table_idx]
        set_table_borders_and_margins(table)
        
        rows_data = [
            ("Caso de Uso", cu["nombre"], True),
            ("Propósito", cu["proposito"], False),
            ("Actores", cu["actores"], False),
            ("Iniciador", cu["iniciador"], False),
            ("Precondición", cu["precondicion"], False),
            ("Flujo de Suceso Principal", cu["flujo"], False),
            ("Postcondición", cu["postcondicion"], False),
            ("Excepción", cu["excepcion"], False)
        ]
        
        # Ensure table has 8 rows
        while len(table.rows) < 8:
            table.add_row()
        while len(table.rows) > 8:
            # remove excess rows
            tr = table.rows[-1]._tr
            tr.getparent().remove(tr)
            
        for r_idx, (label, val, is_header_row) in enumerate(rows_data):
            row = table.rows[r_idx]
            cell0 = row.cells[0]
            cell1 = row.cells[1]

            set_cell_props(cell0, DXA_COL0, FILL_HEADER_LEFT)
            set_cell_props(cell1, DXA_COL1, FILL_HEADER_LEFT if is_header_row else None)

            # Col 0
            cell0.text = ""
            p0 = cell0.paragraphs[0]
            p0.paragraph_format.space_before = Pt(3)
            p0.paragraph_format.space_after = Pt(3)
            p0.paragraph_format.line_spacing = 1.15
            run0 = p0.add_run(label)
            run0.font.name = 'Times New Roman'
            run0.font.size = Pt(10.5)
            run0.bold = True

            # Col 1
            cell1.text = ""
            lines = val.split('\n')
            for l_idx, line in enumerate(lines):
                if l_idx == 0:
                    p1 = cell1.paragraphs[0]
                else:
                    p1 = cell1.add_paragraph()
                p1.paragraph_format.space_before = Pt(1.5)
                p1.paragraph_format.space_after = Pt(1.5)
                p1.paragraph_format.line_spacing = 1.15
                
                run1 = p1.add_run(line)
                run1.font.name = 'Times New Roman'
                run1.font.size = Pt(10.5)
                if is_header_row:
                    run1.bold = True
                    
        print(f"Updated Table {table_idx} -> {cu['id']}")
        
    doc.save(doc_path)
    print(f"Successfully updated master document: {doc_path}")

if __name__ == '__main__':
    update_master_document()
