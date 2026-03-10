from flask import Flask
from flask_cors import CORS


def create_app():
    app = Flask(__name__)
    app.secret_key = "super-secret-key"  
    
    CORS(app, supports_credentials=True, origins=["http://localhost:3000"])
    
    # Blueprinty rejestrowane:
    from auth.routes import auth_bp
    from azure_modules.routes import azure_bp_module
    from gcp.routes import gcp_api
    from aws.routes import aws_api
    
    
    app.register_blueprint(gcp_api)
    app.register_blueprint(auth_bp)
    app.register_blueprint(azure_bp_module)
    app.register_blueprint(aws_api)
    
    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, host="0.0.0.0", port=5000)
