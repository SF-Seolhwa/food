const express = require('express');
var mysql = require('mysql2');
const app = express();
const path = require('path');
require('dotenv').config();

function getRandomValues(array) {
    const shuffled = array.sort(() => 0.5 - Math.random()); // 배열을 랜덤하게 섞음
    return shuffled.slice(0, 4); // 섞인 배열에서 처음 4개를 반환
}

var conn = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "1234",
    database: "recipe"
});

conn.connect(() => {
    console.log("DBconnect");
});

app.set('views', path.join(__dirname, './views'));
app.set('view engine', 'ejs');

app.get('/', async (req, res) => {
    conn.query('select * from recipe', (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        const page = parseInt(req.query.page) || 1;
        const perPage = 10;

        const totalRecipes = result.length;
        const totalPages = Math.ceil(totalRecipes / perPage);

        // 페이지네이션 로직
        const startIndex = (page - 1) * perPage;
        const recipes = result.slice(startIndex, startIndex + perPage); // slice를 사용하여 필요한 만큼 가져옵니다.

        //season
        const time = new Date();
        const month = time.getMonth() + 1;

        let season;
        if (month >= 3 && month <= 5) {
            season = '봄';
        } else if (month >= 6 && month <= 8) {
            season = '여름';
        } else if (month >= 9 && month <= 11) {
            season = '가을';
        } else {
            season = '겨울';
        }

        conn.query(`SELECT ingredient FROM seasoningredient WHERE season = ?`, [season], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }

            const seasonIngredients = result.map(row => row.ingredient);
            if (seasonIngredients.length === 0) {
                return res.send([]); // 해당 시즌에 재료가 없으면 빈 배열 반환
            }

            // 각 재료에 대해 모든 ingredient 컬럼을 확인하는 조건 생성
            const ingredientConditions = seasonIngredients.map(ingredient => {
                return Array.from({ length: 29 }, (_, i) => `ingredient${i + 1} = ?`).join(' OR ');
            }).join(' OR ');

            const query = `
                SELECT id
                FROM ingredientData
                WHERE ${ingredientConditions}
            `;

            // 쿼리의 플레이스홀더에 들어갈 값 배열 생성
            const values = seasonIngredients.flatMap(ingredient => Array(29).fill(ingredient));
        
            conn.query(query, values, async (err, results) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Internal Server Error');
                }
                const recipeId = [];
                const seasonrecipes = [];
                for(let i = 0; i < results.length; i++) {
                    recipeId.push(results[i].id);
                }
                for (let i = 0; i < recipeId.length; i++) {
                    const result = await new Promise((resolve, reject) => {
                        conn.query(`select * from recipe where id = ${recipeId[i]}`, (err, result) => {
                            if (err) {
                                return reject(err);
                            }
                            resolve(result[0]);
                        });
                    });
                    seasonrecipes.push(result);
                }
                const randomrecipes = getRandomValues(seasonrecipes);
                res.render('index', { randomrecipes, recipes, currentPage: page, totalPages });
            });
        });
    });
});

app.get('/recipe/:id', async (req, res) => {
    const recipeId = req.params.id;
  
    try {
        conn.query(`select * from recipe where id = ${recipeId}`, (err, result) => {
            const recipe = result[0];
            res.render('recipe', { recipe });
        })

    } catch (error) {
      console.error(error);
      res.status(500).send('서버 오류가 발생했습니다.');
    }
});

app.get('/search', async (req, res) => {
    const userInput1 = req.query.ingredients;
    const ingredients = userInput1.split(',').map(item => item.trim());
    const userInput2 = req.query.not_ingredients;
    const not_ingredients = userInput2.split(',').map(item => item.trim());

    // 'ingredients' 배열에 포함된 각 재료가 ingredient1부터 ingredient29까지의 컬럼 중 하나에 존재하는지를 검사
    const ingredientConditions = ingredients.map(ingredient => {
        return Array.from({ length: 29 }, (_, i) => `ingredient${i + 1} = ?`).join(' OR ');
    }).join(' OR ');

    const query = `
        SELECT *
        FROM ingredientData
        WHERE ${ingredientConditions}
    `;

    // 'not_ingredients' 배열에 포함된 각 재료가 ingredient1부터 ingredient29까지의 컬럼 중 하나에 존재하지 않는지를 검사
    const notIngredientConditions = not_ingredients.map(ingredient => {
        return Array.from({ length: 29 }, (_, i) => `ingredient${i + 1} = ?`).join(' OR ');
    }).join(' OR ');

    const query2 = `
        SELECT *
        FROM ingredientData
        WHERE ${notIngredientConditions}
    `;

    // 각 재료를 29개의 자리 표시자에 맞게 배열로 변환
    const values = ingredients.flatMap(ingredient => Array(29).fill(ingredient));
    const values2 = not_ingredients.flatMap(ingredient => Array(29).fill(ingredient));

    let input_recipeID = [];
    let input_recipeID2 = [];

    const main_ingredient = ["돼지고기", "소고기", "닭고기", "양고기", "생선"];
    const includedIngredients = main_ingredient.filter(ingredient => ingredients.includes(ingredient));
    const includedingredientConditions = includedIngredients.map(ingredient => {
        return Array.from({ length: 29 }, (_, i) => `ingredient${i + 1} = ?`).join(' OR ');
    }).join(' OR ');
    const values3 = includedIngredients.flatMap(ingredient => Array(29).fill(ingredient));
    const query3 = `
        SELECT *
        FROM ingredientData
        WHERE ${includedingredientConditions}
    `;
    console.log(includedIngredients)
    // 쿼리 실행
    conn.execute(query, values, async (err, results) => {
        if (err) {
            console.error('쿼리 실행 중 오류 발생:', err);
            return;
        }

        // 일치하는 레시피 ID 수집
        for (const result of results) {
            input_recipeID.push(result.ID);
        }

        const recipeId = [];

        // 'not_ingredients'에 대한 쿼리 실행
        conn.execute(query2, values2, async (err, results2) => {
            if (err) {
                console.error('쿼리 실행 중 오류 발생:', err);
                return;
            }
            
            // 일치하지 않는 레시피 ID 수집
            for (const result of results2) {
                input_recipeID2.push(result.ID);
            }

            let check = 0;
            for (let i = 0; i < input_recipeID.length; i++) {
                check = 0;

                // 'not_ingredients'가 빈 경우만 처리
                if (userInput2 === '') {
                    if (!recipeId.includes(input_recipeID[i])) {
                        recipeId.push(input_recipeID[i]);
                    }
                }

                // 'not_ingredients'와 비교하여 제외할 레시피 ID를 제거
                for (let j = 0; j < input_recipeID2.length; j++) {
                    if (input_recipeID[i] === input_recipeID2[j]) {
                        check = 1;
                    }
                }

                // 제외할 레시피 ID가 없다면 결과에 추가
                if (check === 0) {
                    if (!recipeId.includes(input_recipeID[i])) {
                        recipeId.push(input_recipeID[i]);
                    }
                }
            }
            const mainRecipeId = [];
            if(includedIngredients.length != 0) {
                conn.execute(query3, values3, async (err, result3) => {
                    for(result of result3) {
                        mainRecipeId.push(result.ID);
                    }
                    const mainRecipe = [];
                    for(id of mainRecipeId) {
                        if(recipeId.indexOf(id) != -1) {
                            mainRecipe.push(recipeId[recipeId.indexOf(id)])
                        }
                    }
                    const recipes = [];
                    for (let i = 0; i < mainRecipe.length; i++) {
                        const result = await new Promise((resolve, reject) => {
                            conn.query(`SELECT * FROM recipe WHERE id = ${mainRecipe[i]}`, (err, result) => {
                                if (err) {
                                    return reject(err);
                                }
                                resolve(result[0]);
                            });
                        });
                        recipes.push(result);
                    }

                // 최종 결과 렌더링
                console.log("test")
                res.render('searchResults', { userIngredients: ingredients, not_ingredients: not_ingredients, recipes: recipes });
                })
            }
            else {
            // 레시피 정보 조회
            const recipes = [];
            for (let i = 0; i < recipeId.length; i++) {
                const result = await new Promise((resolve, reject) => {
                    conn.query(`SELECT * FROM recipe WHERE id = ${recipeId[i]}`, (err, result) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(result[0]);
                    });
                });
                recipes.push(result);
            }

            // 최종 결과 렌더링
            console.log("test")
            res.render('searchResults', { userIngredients: ingredients, not_ingredients: not_ingredients, recipes: recipes });
        }
        });
    });
});


const ip = process.env.SERVER_IP;

app.get("/imageSearch", (req, res) => {
    //res.redirect(`localhost:5000`);
    res.redirect(`http://${ip}:5000`);
})

app.listen(8080, function(){
    console.log("포트 8080으로 서버 대기중 ... ")
});