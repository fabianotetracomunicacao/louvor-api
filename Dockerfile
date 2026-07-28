FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip

COPY app/requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY app/ .

EXPOSE 3000

CMD ["python3", "api.py"]