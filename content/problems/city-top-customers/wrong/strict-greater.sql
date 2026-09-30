-- Uses > instead of "at least".
SELECT c.name, SUM(o.amount) AS total
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.city = '{{city}}'
GROUP BY c.id, c.name
HAVING SUM(o.amount) > {{min_total}}
ORDER BY total DESC, c.name ASC;
