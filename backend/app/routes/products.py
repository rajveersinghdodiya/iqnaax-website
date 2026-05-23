import json
import os
import time
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from app.utils.database import get_db_connection
from app.routes.admin import admin_auth_required

products_bp = Blueprint('products', __name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads', 'products')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def parse_json_array(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    try:
        return json.loads(value)
    except Exception:
        return []


def get_image_full_url(image_path, image_url=None):
    if image_path:
        host_url = request.url_root.rstrip('/')
        return f"{host_url}/api{image_path}"
    return image_url


def build_image_object(row):
    return {
        'id': row['id'],
        'image_path': row['image_path'],
        'image_url': row['image_url'],
        'image_full_url': get_image_full_url(row['image_path'], row['image_url']),
        'sort_order': row['sort_order'],
    }


def get_product_images(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
        (product_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [build_image_object(row) for row in rows]


def build_product(row):
    images = get_product_images(row['id'])
    if not images and row['image_url']:
        images = [
            {
                'id': None,
                'image_path': None,
                'image_url': row['image_url'],
                'image_full_url': row['image_url'],
                'sort_order': 0,
            }
        ]
    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'],
        'price': row['price'],
        'video_url': row['video_url'],
        'image_url': row['image_url'],
        'created_at': row['created_at'],
        'images': images,
    }


def get_next_sort_order(cursor, product_id):
    cursor.execute('SELECT MAX(sort_order) AS max_sort FROM product_images WHERE product_id = ?', (product_id,))
    row = cursor.fetchone()
    return (row['max_sort'] or 0) + 1


def save_image_file(cursor, product_id, file, sort_order):
    if not file or not file.filename or not allowed_file(file.filename):
        return
    filename = secure_filename(file.filename)
    filename = f"{int(time.time())}_{filename}"
    dest = os.path.join(UPLOAD_FOLDER, filename)
    file.save(dest)
    cursor.execute(
        'INSERT INTO product_images (product_id, image_path, image_url, sort_order) VALUES (?, ?, ?, ?)',
        (product_id, f'/uploads/products/{filename}', None, sort_order),
    )


def delete_image_row(cursor, image_id):
    cursor.execute('SELECT image_path FROM product_images WHERE id = ?', (image_id,))
    row = cursor.fetchone()
    if not row:
        return
    image_path = row['image_path']
    if image_path:
        file_path = os.path.join(BASE_DIR, image_path.lstrip('/').replace('/', os.sep))
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass
    cursor.execute('DELETE FROM product_images WHERE id = ?', (image_id,))


@products_bp.route('/products', methods=['GET'])
def get_products():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM products ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()

    products = [build_product(row) for row in rows]
    return jsonify(products), 200


@products_bp.route('/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Product not found'}), 404
    return jsonify(build_product(row)), 200


@products_bp.route('/products', methods=['POST'])
@admin_auth_required
def create_product():
    name = request.form.get('name') or (request.get_json(silent=True) or {}).get('name')
    description = request.form.get('description') or (request.get_json(silent=True) or {}).get('description')
    price = request.form.get('price') or (request.get_json(silent=True) or {}).get('price')
    image_url = request.form.get('image_url') or (request.get_json(silent=True) or {}).get('image_url')
    video_url = request.form.get('video_url') or (request.get_json(silent=True) or {}).get('video_url')
    image_urls = parse_json_array(request.form.get('image_urls') or (request.get_json(silent=True) or {}).get('image_urls'))

    try:
        price_value = float(price) if price is not None else 0.0
    except ValueError:
        price_value = 0.0

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO products (name, description, price, image_url, video_url) VALUES (?, ?, ?, ?, ?)',
        (name, description, price_value, image_url, video_url),
    )
    conn.commit()
    product_id = cursor.lastrowid

    sort_order = 0
    for image in image_urls:
        if isinstance(image, str) and image.strip():
            cursor.execute(
                'INSERT INTO product_images (product_id, image_path, image_url, sort_order) VALUES (?, ?, ?, ?)',
                (product_id, None, image.strip(), sort_order),
            )
            sort_order += 1

    files = request.files.getlist('images')
    for file in files:
        save_image_file(cursor, product_id, file, sort_order)
        sort_order += 1

    conn.commit()
    cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
    row = cursor.fetchone()
    conn.close()

    return jsonify({'message': 'Product created successfully', 'product': build_product(row)}), 201


@products_bp.route('/products/<int:product_id>', methods=['PUT'])
@admin_auth_required
def update_product(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Product not found'}), 404

    name = request.form.get('name') or (request.get_json(silent=True) or {}).get('name')
    description = request.form.get('description') or (request.get_json(silent=True) or {}).get('description')
    price = request.form.get('price') or (request.get_json(silent=True) or {}).get('price')
    image_url = request.form.get('image_url') or (request.get_json(silent=True) or {}).get('image_url')
    video_url = request.form.get('video_url') or (request.get_json(silent=True) or {}).get('video_url')
    image_urls = parse_json_array(request.form.get('image_urls') or (request.get_json(silent=True) or {}).get('image_urls'))
    deleted_image_ids = parse_json_array(request.form.get('deleted_image_ids') or (request.get_json(silent=True) or {}).get('deleted_image_ids'))
    image_order = parse_json_array(request.form.get('image_order') or (request.get_json(silent=True) or {}).get('image_order'))

    try:
        price_value = float(price) if price is not None else row['price']
    except ValueError:
        price_value = row['price']

    updated_name = name or row['name']
    updated_description = description or row['description']
    updated_image_url = image_url if image_url is not None else row['image_url']
    updated_video_url = video_url if video_url is not None else row['video_url']

    cursor.execute(
        'UPDATE products SET name = ?, description = ?, price = ?, image_url = ?, video_url = ? WHERE id = ?',
        (updated_name, updated_description, price_value, updated_image_url, updated_video_url, product_id),
    )

    for image_id in deleted_image_ids:
        try:
            delete_image_row(cursor, int(image_id))
        except Exception:
            pass

    if isinstance(image_order, list):
        for sort_index, image_id in enumerate(image_order):
            if image_id is None:
                continue
            try:
                cursor.execute(
                    'UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?',
                    (sort_index, int(image_id), product_id),
                )
            except Exception:
                pass

    for image in image_urls:
        if isinstance(image, str) and image.strip():
            next_order = get_next_sort_order(cursor, product_id)
            cursor.execute(
                'INSERT INTO product_images (product_id, image_path, image_url, sort_order) VALUES (?, ?, ?, ?)',
                (product_id, None, image.strip(), next_order),
            )

    files = request.files.getlist('images')
    for file in files:
        next_order = get_next_sort_order(cursor, product_id)
        save_image_file(cursor, product_id, file, next_order)

    conn.commit()
    cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
    updated = cursor.fetchone()
    conn.close()

    return jsonify({'message': 'Product updated successfully', 'product': build_product(updated)}), 200


@products_bp.route('/products/<int:product_id>', methods=['DELETE'])
@admin_auth_required
def delete_product(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
    product = cursor.fetchone()
    if not product:
        conn.close()
        return jsonify({'error': 'Product not found'}), 404

    cursor.execute('SELECT id FROM product_images WHERE product_id = ?', (product_id,))
    image_rows = cursor.fetchall()
    for image_row in image_rows:
        delete_image_row(cursor, image_row['id'])

    cursor.execute('DELETE FROM products WHERE id = ?', (product_id,))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Product deleted successfully'}), 200


@products_bp.route('/uploads/products/<path:filename>', methods=['GET'])
def serve_uploaded_product_image(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)
