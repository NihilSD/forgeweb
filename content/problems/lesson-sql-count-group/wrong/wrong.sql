SELECT category, SUM(stock) AS n FROM products GROUP BY category ORDER BY category;
