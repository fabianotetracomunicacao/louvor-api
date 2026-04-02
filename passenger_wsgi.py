import os
import sys

# Define o caminho do diretório do seu aplicativo
sys.path.insert(0, os.path.dirname(__file__) + '/app')

# Importa o objeto 'app' do seu arquivo api.py
from api import app as application

# Se precisar definir variáveis de ambiente específicas do servidor:
# os.environ['FLASK_ENV'] = 'production'
