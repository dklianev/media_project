const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('server/database.sqlite', (err) => {
    if (err) console.error(err.message);
});

db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
        if (err) {
            console.error('Error creating table:', err);
        } else {
            console.log('support_tickets table created successfully');
        }
        db.close();
    });
});
