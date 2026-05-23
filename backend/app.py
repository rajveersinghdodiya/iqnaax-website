import os
from flask import Flask, request
from flask_cors import CORS
from dotenv import load_dotenv, find_dotenv

# Load environment variables and log which .env was loaded
dotenv_path = find_dotenv()
if dotenv_path:
    loaded = load_dotenv(dotenv_path)
    print(f"Loaded .env from: {dotenv_path} (loaded={loaded})")
else:
    # Fallback: try .env next to this file
    candidate = os.path.join(os.path.dirname(__file__), '.env')
    loaded = load_dotenv(candidate)
    print(f"find_dotenv didn't locate a .env; tried {candidate} (loaded={loaded})")

def create_app():
    """Create and configure Flask application"""
    app = Flask(__name__)
    
    # Basic configuration
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # Initialize CORS for all API routes and preflight requests
    cors_origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:4174",
        "http://127.0.0.1:4174",
    ]

    CORS(app, resources={
        r"/api/*": {
            "origins": cors_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": [
                "Content-Type",
                "Authorization",
                "Accept",
                "Origin",
                "X-Requested-With",
            ],
            "supports_credentials": True,
        }
    })

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin")
        if origin in cors_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,Accept,Origin,X-Requested-With"
            response.headers["Vary"] = "Origin"
        return response
    
    # Initialize database
    from app.utils.database import init_database
    init_database()
    
    # Register blueprints/routes
    from app.routes.health import health_bp
    from app.routes.admin import admin_bp
    from app.routes.products import products_bp
    from app.routes.contact import contact_bp
    from app.routes.blogs import blogs_bp
    
    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(admin_bp, url_prefix='/api')
    app.register_blueprint(products_bp, url_prefix='/api')
    app.register_blueprint(contact_bp, url_prefix='/api')
    app.register_blueprint(blogs_bp, url_prefix='/api')
    
    return app

# Create app instance
app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5000))
    host = os.getenv('FLASK_HOST', '127.0.0.1')
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    
    app.run(host=host, port=port, debug=debug)
