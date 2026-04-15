'use strict';
const { db } = require('../server/db');
const bcrypt = require('bcryptjs');

const testUser = 'pos_verify_' + Date.now().toString(36);
const pw_hash = bcrypt.hashSync('Test123!', 10);
db.prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)').run(testUser, pw_hash);
const acc = db.prepare('SELECT id FROM accounts WHERE username=?').get(testUser);

db.prepare('INSERT INTO characters (account_id,name,surname,gender,biome,profession,hp,max_hp,mp,max_mp,atk,def,spd,level,exp,gold,map_x,map_y,pos_x,pos_y,traits,inventory,equipment,skills,skill_xp,life_skills,status_effects,family_slot) VALUES (?,?,?,?,?,?,100,100,50,50,10,5,5,1,0,100,0,0,0,0,?,?,?,?,?,?,?,?)')
  .run(acc.id, 'TestPos', 'Test', 'M', 'forest', 'martial', '[]', '[]', '{}', '[]', '{}', '{}', '[]', '{}');
const char = db.prepare('SELECT id FROM characters WHERE account_id=? AND is_alive=1').get(acc.id);

const mapX = 45273, mapY = 45273;
const bankSpotX = 7, bankSpotY = 10;
db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=? WHERE id=?')
  .run(mapX, mapY, bankSpotX, bankSpotY, char.id);

const updated = db.prepare('SELECT pos_x, pos_y, map_x, map_y FROM characters WHERE id=?').get(char.id);
console.log('Written pos_x=7,pos_y=10. Read back:', JSON.stringify(updated));

db.prepare('DELETE FROM characters WHERE account_id=?').run(acc.id);
db.prepare('DELETE FROM accounts WHERE id=?').run(acc.id);
