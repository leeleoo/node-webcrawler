/**
 * Created by leo on 16/4/6.
 */
var mysql = require('mysql')
var pool = mysql.createPool({
	connectionLimit:10,
	host:'123.57.10.24',
	user:'root',
	password:'123456',
	database:'vnavigate',
})
pool.query('SELECT 1 + 1 AS solution',function(err,rows,fields){
	if(err) throw err;
	console.log('',rows[0].solution)
})
module.exports = pool
		/*** pool.getConnection(function(err, connection) {
  // Use the connection
  connection.query( 'SELECT something FROM sometable', function(err, rows) {
    // And done with the connection.
    connection.release();

    // Don't use the connection here, it has been returned to the pool.
  });
});
		 */
