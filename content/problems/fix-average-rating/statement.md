The product page for **{{product}}** shows an average star rating, but customers report that the number looks wrong.

`average_rating(ratings)` receives the list of ratings for one product. Each rating is an integer from 1 to 5, or `0`, which means the customer skipped rating.

It should return the **average of the non-zero ratings** as a floating-point number, or `0` if there are no non-zero ratings.

The current implementation has **one bug**. Run the tests, find it, and fix it. Keep the function name the same.

## Example

```
ratings = {{example_ratings}}
result  = {{example_result}}
```
