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

//검색기능 - 유저가 입력한 재료 모두가 들어가는 레시피 검색
app.get('/search', async (req, res) => {
    const userInput1 = req.query.ingredients;
    const ingredients = userInput1.split(',').map(item => item.trim());
    const userInput2 = req.query.not_ingredients;
    const not_ingredients = userInput2.split(',').map(item => item.trim());

    let input_recipe = [];
    let input_recipe2 = [];

    //유저가 입력한 사용할 재료를 기반으로 음식검색
    for (let i = 0; i < ingredients.length; i++) {
        const searchRecipe = [];
        const results = await new Promise((resolve, reject) => {
            const value = ingredients[i];
    
            // 29번 반복된 배열을 생성
            const values = Array(29).fill(value);
    
            // 각 ingredient에 대해 조건을 나누어서 쿼리 생성
            const query = `
                SELECT *
                FROM ingredientData
                WHERE ${values.map((_, index) => `ingredient${index + 1} = ?`).join(' OR ')}
            `;
    
            conn.query(query, values, (err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result);
            });
        });
        for(result of results) {
            searchRecipe.push(result.ID);
        }
        input_recipe.push(searchRecipe);
    }
    const recipe1 = [];
    let countMap1 = {};

    //유저가 입력한 재료가 모두 들어가는지 검사
    input_recipe.forEach((subArr, subArrIndex) => {
        subArr.forEach(element => {
            // 요소가 이미 등장한 서브 배열을 기록
            if (!countMap1[element]) {
                countMap1[element] = new Set(); // 새로운 Set 생성
            }
            countMap1[element].add(subArrIndex); // 해당 서브 배열 인덱스를 추가
        });
    });

    //모두 등장한 레시피를 추출
    for (let element in countMap1) {
        if (countMap1[element].size === ingredients.length) {
            recipe1.push(parseInt(element));
        }
    }

    //유저가 입력한 사용하지 않을 재료를 기반으로 검색
    if(not_ingredients != '') {
        for (let i = 0; i < not_ingredients.length; i++) {
            const results = await new Promise((resolve, reject) => {
                const value = not_ingredients[i];
        
                // 29번 반복된 배열을 생성
                const values = Array(29).fill(value);
        
                // 각 ingredient에 대해 조건을 나누어서 쿼리 생성
                const query = `
                    SELECT *
                    FROM ingredientData
                    WHERE ${values.map((_, index) => `ingredient${index + 1} = ?`).join(' OR ')}
                `;
        
                conn.query(query, values, (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(result);
                });
            });
            for(result of results) {
                input_recipe2.push(result.ID);
            }
        }
        const recipe2 = [];

        //제외된 식재료가 포함된 경우 검색결과에서 제외
        for(recipe of recipe1) {
            if(!input_recipe2.includes(recipe)) {
                recipe2.push(recipe);
            }
        }

        //필터링된 레시피 id를 기반으로 레시피 검색
        const recipes = [];
        for (let i = 0; i < recipe2.length; i++) {
            const result = await new Promise((resolve, reject) => {
                conn.query(`SELECT * FROM recipe WHERE id = ${recipe2[i]}`, (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(result[0]);
                });
            });
            recipes.push(result);
        }
        res.render('searchResults', { userIngredients: ingredients, not_ingredients: not_ingredients, recipes: recipes });
    }
    else {
        //사용하지 않을 재료를 입력하지 않은 경우
        //즉시 id를 기반으로 레시피 검색
        const recipes = [];
        for (let i = 0; i < recipe1.length; i++) {
            const result = await new Promise((resolve, reject) => {
                conn.query(`SELECT * FROM recipe WHERE id = ${recipe1[i]}`, (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(result[0]);
                });
            });
            recipes.push(result);
        }
        res.render('searchResults', { userIngredients: ingredients, not_ingredients: not_ingredients, recipes: recipes });
    }
});


const ip = process.env.SERVER_IP;

app.get("/imageSearch", (req, res) => {
    res.redirect(`http://${ip}:5000`);
})

app.listen(8080, function(){
    console.log("포트 8080으로 서버 대기중 ... ")
});