const db = require('../config/database');
const fs = require('fs');
const util = require('util');
const dbquery = util.promisify(db.query).bind(db);
const { uploadFile } = require('../config/uploadFile');

module.exports = {
	getProducts: async (req, res) => {
		try {
			let query = `select p.id, b.brand, p.name, p.price, p.stock from products p
                        left join brands b on b.id = p.brandId`;
			const result = await dbquery(query);

			query = `select * from product_cats_complete`;
			const productCats = await dbquery(query);

			result.forEach((p) => {
				var x = productCats.filter((i) => i.productId === p.id);
				p.categories = x
					.map((i) => {
						return { categoryId: i.categoryId, category: i.category };
					})
					.sort((a, b) => a.categoryId - b.categoryId);
			});
			res.status(200).send(result);
		} catch (error) {
			res.status(500).send(error);
		}
	},

	getUncategorizedProduct: async (req, res) => {
		try {
			const query = `select p.*, b.brand from products p
                            left join product_cats pc on p.id = pc.productId
                            join brands b on b.id = p.brandId
                            where pc.id is null`;
			let result = await dbquery(query);
			res.status(200).send(result);
		} catch (error) {
			res.status(500).send(error);
		}
	},

	getProductByCategoryId: async (req, res) => {
		try {
			let query = `select p.id, b.brand, p.name, p.price, p.stock, pi.id as imageId, pi.image from products p
                        join product_cats pc on pc.productId = p.id
						join brands b on b.id = p.brandId
						left join product_images pi on pi.productId = p.id
						where pc.categoryId = ?
						group by p.id order by p.id desc
                        ${req.query.limit ? `limit ? offset ?` : ''}`;
			const result = await dbquery(query, [
				req.params.categoryId,
				parseInt(req.query.limit),
				parseInt(req.query.offset)
			]);

			if (result.length === 0) {
				return res.status(404).send({ message: 'product not found' });
			}

			query = `select * from product_cats_complete
                    where productId in (?)`;
			const productCats = await dbquery(query, [result.map((i) => i.id)]);

			result.forEach((p) => {
				var x = productCats.filter((i) => i.productId === p.id);
				if (p.imageId === null) {
					p.image = `/images/products/default.png`
				}
				p.categories = x
					.map((i) => {
						return { categoryId: i.categoryId, category: i.category };
					})
					.sort((a, b) => a.categoryId - b.categoryId);
			});
			res.status(200).send(result);
		} catch (error) {
			res.status(500).send(error);
		}
	},

	getCountProductByCategoryId: async (req, res) => {
		try {
			let query = `select count(p.id) as count from products p
                        join product_cats pc on pc.productId = p.id
                        join brands b on b.id = p.brandId
                        where pc.categoryId = ?`;
			const result = await dbquery(query, [req.params.categoryId]);
			if (result.length === 0) {
				return res.status(404).send({ message: 'product not found' });
			}
			res.status(200).send(result[0]);
		} catch (error) {
			res.status(500).send(error);
		}
	},

	getProductDetailById: async (req, res) => {
		try {
			let query = `select p.* from products p
                        join brands b on b.id = p.brandId
                        where p.id = ?`;
			const result = await dbquery(query, [req.params.id]);

			if (result.length === 0) {
				return res.status(404).send({ message: 'product not found' });
			}

			query = `select id, image from product_images where productId = ?`;
			const images = await dbquery(query, [result[0].id]);

			query = `select categoryId, category from product_cats_complete
                    where productId = ?`;
			const productCats = await dbquery(query, [result[0].id]);

			if (images.length === 0) {
				result[0].images = [{ id: null, image: `/images/products/default.png` }]
			} else {
				result[0].images = images
			}
			result[0].categories = productCats.sort((a, b) => a.categoryId - b.categoryId);
			res.status(200).send(result[0]);
		} catch (error) {
			res.status(500).send(error);
		}
	},

	addProduct: async (req, res) => {
		const path = '/images/products';
		let images = [];
		const upload = util.promisify(uploadFile(path, 'IMG').fields([{ name: 'image' }]));

		try {
			await upload(req, res);
			if (req.files.image) {
				images = req.files.image.map((i) => `${path}/${i.filename}`);
			}

			const data = JSON.parse(req.body.data);
			let query = `INSERT INTO products SET ?`;
			const result = await dbquery(query, { ...data.newProduct });

			if (req.files.image) {
				let img = images.map((i) => [result.insertId, i]);
				console.log(img)
				query = `INSERT INTO product_images (productId,image) VALUES ?`;
				await dbquery(query, [img]);
			}

			let productCat = data.newCategories.map((i) => [result.insertId, i]);
			query = `INSERT INTO product_cats (productId,categoryId) VALUES ?`;
			await dbquery(query, [productCat]);

			res.status(200).send(result);
		} catch (error) {
			if (images.length !== 0) {
				images.forEach((i) => {
					fs.unlinkSync('./public' + i);
				});
			}
			res.status(500).send(error);
		}
	},

	editProductById: async (req, res) => {
		const path = '/images/products';
		let images = [];
		const upload = util.promisify(uploadFile(path, 'IMG').fields([{ name: 'image' }]));
		let query;
		try {
			await upload(req, res);
			const id = parseInt(req.params.id);
			const data = JSON.parse(req.body.data);
			const deleteImage = JSON.parse(req.body.deleteImage)

			if (req.files.image) {
				images = req.files.image.map((i) => `${path}/${i.filename}`);
				let arr = images.map((i) => [id, i]);
				query = `INSERT INTO product_images (productId,image) VALUES ?`;
				await dbquery(query, [arr]);
			}
			if (deleteImage.length !== 0) {
				deleteImage.forEach(i => {
					fs.unlinkSync('./public' + i.image)
					console.log('delete: ', './public' + i.image)
				})
				let imageId = deleteImage.map(i => i.id)
				console.log('imageId:', imageId)
				query = `DELETE FROM product_images WHERE id in (?)`
				await dbquery(query, [imageId])
				console.log('delete done')
			}

			console.log(data.newProduct)
			query = `UPDATE products SET ? WHERE id = ${db.escape(id)}`;
			const result = await dbquery(query, data.newProduct);

			query = `DELETE FROM product_cats WHERE productId = ?`;
			await dbquery(query, [id]);

			let productCat = data.newCategories.map((i) => [id, i]);
			console.log('productCat', productCat)
			query = `INSERT INTO product_cats (productId,categoryId) VALUES ?`;
			await dbquery(query, [productCat]);
			res.status(200).send(result);

		} catch (error) {
			if (images.length !== 0) {
				images.forEach((i) => {
					fs.unlinkSync('./public' + i);
				});
			}
			res.status(500).send(error);
		}
	},

	deleteProductById: async (req, res) => {
		try {
			let query = `DELETE FROM products WHERE id = ?`;
			const result = await dbquery(query, [req.params.id]);
			if (result.affectedRows === 0) {
				return res.status(404).send({ message: 'product id not found' });
			}
			query = `DELETE FROM product_cats WHERE productId = ?`;
			await dbquery(query, [req.params.id])

			query = `SELECT * FROM product_images WHERE productId = ?`;
			let selected = await dbquery(query, [req.params.id])
			selected.forEach(i => fs.unlinkSync('./public' + i.image))

			query = `DELETE FROM product_images WHERE productId = ?`;
			await dbquery(query, [req.params.id])
			res.status(200).send(result);
		} catch (error) {
			res.status(500).send(error);
		}
	}
};
