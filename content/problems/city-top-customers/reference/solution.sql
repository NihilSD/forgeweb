SELECT c.name, COALESCE(SUM(o.amount), 0) AS total
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE c.city = '{{city}}'
GROUP BY c.id, c.name
HAVING COALESCE(SUM(o.amount), 0) >= {{min_total}}
ORDER BY total DESC, c.name ASC;
