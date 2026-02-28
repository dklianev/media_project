const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('server/database.sqlite');
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='support_tickets'", (err, rows) => {
    if (err) console.error(err);
    console.log('Tables:', rows);
    db.close();
});
