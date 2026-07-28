# Plataformas como Serviço para Deploy de Aplicação Python

Aqui estão algumas opções de plataformas gratuitas para deploy de aplicações Python (como o caso da API deste repositório):

---

## 1. Render
- **Descrição:** Oferece deploy para aplicações web, APIs e workers. Suporta Python nativamente e permite configuração simples com `requirements.txt`.
- **Plano gratuito:** 750 horas/mês para web services ou workers (equivalente a 1 serviço rodando continuamente).
- **Como usar:**
  1. Crie seu repositório GitHub.
  2. Conecte o repositório ao Render.
  3. Configure o build command (`pip install -r requirements.txt`) e o start command (ex.: `gunicorn app:app`).
- **Link:** [https://render.com](https://render.com)

---

## 2. Railway
- **Descrição:** Permite deploy rápido de serviços back-end. Suporta Python e tem integração com bancos de dados no plano gratuito.
- **Plano gratuito:** Até 500 horas/mês e 1 GB de uso em dado.
- **Como usar:**
  1. Conecte seu repositório GitHub ao Railway.
  2. Configure variáveis de ambiente e os comandos necessários para rodar o servidor (`pip install` e `gunicorn` ou equivalente).
- **Link:** [https://railway.app](https://railway.app)

---

## 3. Fly.io
- **Descrição:** Projetado para aplicações rodarem próximas de seus usuários. Suporta Python e apps baseados em containers.
- **Plano gratuito:** Oferece 3 máquinas pequenas gratuitas.
- **Como usar:**
  1. Instale o CLI do Fly.io.
  2. Configure o arquivo `fly.toml` para descrever o app.
  3. Publique diretamente com comandos do Fly (`fly deploy`).
- **Link:** [https://fly.io](https://fly.io)

---

## 4. Deta (para microsserviços)
- **Descrição:** Projetado para microsserviços e APIs. É extremamente simples de usar com Python.
- **Plano gratuito:** Gratuito para sempre, com hospedagem limitada a microsserviços (recomendado para APIs pequenas).
- **Como usar:**
  1. Instale o CLI da Deta.
  2. Configure o serviço com um único arquivo Python (`main.py`), sem necessidade de gerenciar servidor.
- **Link:** [https://deta.space](https://deta.space)

---

## 5. PythonAnywhere
- **Descrição:** Ideal para o deploy de aplicações Python de forma gratuita. Mas possui limitações, especialmente para APIs por possuir baixa prioridade de CPU.
- **Plano gratuito:** Hospedagem simples de até um projeto por conta gratuita.
- **Como usar:**
  1. Crie uma conta no PythonAnywhere.
  2. Suba seus arquivos ou conecte via Git.
  3. Configure o WSGI e o servidor corretamente para hospedar sua aplicação.
- **Link:** [https://www.pythonanywhere.com](https://www.pythonanywhere.com)

---

## 6. Vercel (com suporte a Serverless Functions)
- **Descrição:** Desenvolvido para front-end, mas suporta funções back-end (serverless) que podem ser úteis para APIs pequenas. Projetos Python podem ser adaptados para funcionar.
- **Plano gratuito:** Hospedagem gratuita com execução limitada para funções serverless e ótima integração com GitHub.
- **Como usar:**
  1. Configure suas APIs dentro da pasta `api/` (ajustando seu projeto para formato serverless).
  2. Suba o projeto no GitHub e conecte ao Vercel.
- **Link:** [https://vercel.com](https://vercel.com)

---

**Recomendações:** Para começar, recomendamos Render ou Railway, pois oferecem simplicidade e bom suporte para rodar aplicações Python. Se a aplicação for pequena e você precisa de algo leve, o Deta é uma ótima opção!