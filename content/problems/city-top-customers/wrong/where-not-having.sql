-- Filters single orders instead of totals.
SELECT c.name, SUM(o.amount) AS total
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.city = '{{city}}' AND o.amount >= {{min_total}}
GROUP BY c.id, c.name
ORDER BY total DESC, c.name ASC;
