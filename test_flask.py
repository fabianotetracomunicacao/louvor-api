from flask import Flask, request
app = Flask(__name__)
@app.route('/test')
def test():
    val = request.args.get('gospel', '1').strip()
    return f"VAL IS {val}"
if __name__ == '__main__':
    app.run(port=5050)
