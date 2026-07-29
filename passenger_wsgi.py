import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importa o objeto 'app' do seu arquivo api.py
from api import app as application

# Se precisar definir variáveis de ambiente específicas do servidor:
# os.environ['FLASK_ENV'] = 'production'
