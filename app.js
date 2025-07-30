const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: 'n3z0p5.h.filess.io',
    port: 3307,
    user: 'CA2_seewagonam',
    password: '5dbb4b5633f5bdf479cb22649b616742c58cf370',
    database: 'CA2_seewagonam'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
// enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

// Session Middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

app.use(flash());

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Define routes
app.get('/', (req, res) => {
    res.render('index', {user: req.session.user} );
});

app.get('/inventory', checkAuthenticated, checkAdmin, (req, res) => {
  const user = req.session.user;
  const search = req.query.search || "";
  const genreFilter = req.query.genre || "";
 
  let sql = "SELECT * FROM book WHERE 1"; // dummy condition to append AND clauses easily
  const params = [];
 
  if (search) {
    sql += " AND title LIKE ?";
    params.push(`%${search}%`);
  }
 
  if (genreFilter) {
    sql += " AND genre = ?";
    params.push(genreFilter);
  }
 
  connection.query(sql, params, (error, results) => {
    if (error) throw error;
    res.render('inventory', {
      books: results,
      user: user,
      search: search,
      genreFilter: genreFilter
    });
  });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (name, email, password, address, contact, account) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/shopping');
            else
                res.redirect('/inventory');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/shopping', checkAuthenticated, (req, res) => {
    connection.query('SELECT * FROM book', (error, results) => {
        if (error) throw error;
        res.render('shopping', { user: req.session.user, books: results, cart: req.session.cart || [] });
    });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const bookId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM book WHERE bookId = ?', [bookId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const book = results[0];

            if (!req.session.cart) {
                req.session.cart = [];
            }

            const existingItem = req.session.cart.find(item => item.bookId === bookId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    bookId: book.bookId,
                    title: book.title,
                    author: book.author,
                    price: Number(book.price),
                    quantity: quantity,
                    cover: book.cover
                });
            }

            res.redirect('/cart');
        } else {
            res.status(404).send("Book not found");
        }
    });
});

app.post('/remove-from-cart/:id', checkAuthenticated, (req, res) => {
    const bookId = parseInt(req.params.id);

    if (!req.session.cart) {
        return res.redirect('/shopping');
    }

    req.session.cart = req.session.cart.filter(item => Number(item.bookId) !== bookId);
    res.redirect('/cart');
});

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.get('/checkout', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
        let total = 0;
    for (let i = 0; i < cart.length; i++) {
        total += Number(cart[i].price) * Number(cart[i].quantity);
    }

    res.render('checkout', { user: req.session.user, cart, total });
});

app.post('/confirm-checkout', checkAuthenticated, async (req, res) => {
    const cart = req.session.cart || [];

    for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const bookId = item.bookId;

        await new Promise((resolve, reject) => {
            connection.query(
                'UPDATE book SET quantity = quantity - 1 WHERE bookId = ? AND quantity > 0',
                [bookId],
                (err, result) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
    req.session.cart = [];
    res.redirect('/shopping');
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/book/:id', checkAuthenticated, (req, res) => {
    const bookId = req.params.id;

    connection.query('SELECT * FROM book WHERE bookId = ?', [bookId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const book = results[0];
            book.price = parseFloat(book.price); // ✅ Now it's safe

            res.render('book', { book, user: req.session.user });
        } else {
            res.status(404).send('Book not found');
        }
    });
});

app.get('/addBook', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addBook', {user: req.session.user } ); 
});

app.post('/addBook', upload.single('cover'), (req, res) => {
    const { title, author, isbn, quantity, price, genre } = req.body;
    let cover;
    if (req.file) {
        cover = req.file.filename;
    } else {
        cover = null;
    }

    const sql = 'INSERT INTO books (title, author, isbn, quantity, price, genre, cover) VALUES (?, ?, ?, ?, ?, ?, ?)';
    connection.query(sql, [title, author, isbn, quantity, price, genre, cover], (error, results) => {
        if (error) {
            console.error("Error adding book:", error);
            res.status(500).send('Error adding book');
        } else {
            res.redirect('/inventory');
        }
    });
});

app.get('/updateBook/:id', checkAuthenticated, checkAdmin, (req,res) => {
    const bookId = req.params.id;
    const sql = 'SELECT * FROM books WHERE bookId = ?';

    connection.query(sql, [bookId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            res.render('updateBook', { book: results[0] });
        } else {
            res.status(404).send('Book not found');
        }
    });
});

app.post('/updateBook/:id', upload.single('cover'), (req, res) => {
    const bookId = req.params.id;
    const { title, author, isbn, quantity, price, genre, currentCover } = req.body;
    let cover = currentCover;
    if (req.file) {
        cover = req.file.filename;
    } 

    const sql = 'UPDATE books SET title = ?, author = ?, isbn = ?, quantity = ?, price = ?, genre = ?, cover = ? WHERE bookId = ?';
    connection.query(sql, [title, author, isbn, quantity, price, genre, cover, bookId], (error, results) => {
        if (error) {
            console.error("Error updating book:", error);
            res.status(500).send('Error updating book');
        } else {
            res.redirect('/inventory');
        }
    });
});

app.get('/deleteBook/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const bookId = req.params.id;

    connection.query('DELETE FROM books WHERE bookId = ?', [bookId], (error, results) => {
        if (error) {
            console.error("Error deleting book:", error);
            res.status(500).send('Error deleting book');
        } else {
            res.redirect('/inventory');
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
