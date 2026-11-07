# Script para actualizar el documento formal Word
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn
import os

DOC_PATH = '1er Examen Parcial - DiagramadorUML.docx'
IMG_DIR = 'diagramas_enterprise_architect/imagenes'

doc = docx.Document(DOC_PATH)

# 1. ACTUALIZAR CARÁTULA
print('Actualizando carátula...')
p5 = doc.paragraphs[5]
p5.text = 'Estudiantes:\nCamacho Jimenez Jairo Lisandro - 222053348\nIsaac Orellana Escobar - 222056541'
p5.runs[0].font.bold = True

print('Carátula actualizada.')
