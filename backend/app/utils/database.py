import os
import sqlite3
import bcrypt

# Database configuration
DATABASE_PATH = os.getenv('DATABASE_PATH', 'iqnaax.db')
DEFAULT_ADMIN_EMAIL = 'admin@iqnaax.com'
DEFAULT_ADMIN_PASSWORD = 'admin123'

def get_db_connection():
    """Get a database connection"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_default_admin(conn):
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM admins WHERE email = ?', (DEFAULT_ADMIN_EMAIL,))
    if cursor.fetchone() is None:
        password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
        cursor.execute(
            'INSERT INTO admins (email, password) VALUES (?, ?)',
            (DEFAULT_ADMIN_EMAIL, password_hash)
        )


def init_database():
    """Initialize database with required tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create admins table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    
    # Create products table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            price REAL,
            image_url TEXT,
            video_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Create product images table for multiple image support
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS product_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            image_path TEXT,
            image_url TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create contacts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            organization TEXT,
            inquiry_type TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Ensure any missing contact columns are added after schema changes
    cursor.execute("PRAGMA table_info(contacts)")
    existing_contact_columns = {row[1] for row in cursor.fetchall()}
    required_contact_columns = {
        'organization': 'TEXT',
        'inquiry_type': 'TEXT',
        'message': 'TEXT'
    }
    for column_name, column_type in required_contact_columns.items():
        if column_name not in existing_contact_columns:
            cursor.execute(
                f'ALTER TABLE contacts ADD COLUMN {column_name} {column_type}'
            )

    # Create one-time password table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS otp_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Create blogs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS blogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            content TEXT,
            image_path TEXT,
            image_url TEXT,
            video_url TEXT,
            category TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Create admin_users table for sub-admins and super admin
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )
    ''')
    
    conn.commit()
    # Create default admin user if missing
    cursor.execute('SELECT id FROM admin_users WHERE username = ?', ('admin',))
    if cursor.fetchone() is None:
        password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
        cursor.execute(
            'INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)',
            ('admin', password_hash, 'super_admin')
        )
    conn.commit()
    conn.commit()
    conn.close()
