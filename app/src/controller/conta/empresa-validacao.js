;(function () {
    "use strict";
    
    const Joi = require("joi"),
        Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore");
    


    // verifica se e-mail está em uso por outra empresa no nomento do cadastro
    function dadosEmUsoUser(email, empresaID){
        return new Promise( function (resolve, reject) {
            let erros = {};
            if(!email) return resolve();

            let where = 'email = ?';
            let col = [email];
            if( empresaID ) {
                where += ' AND id != ?';
                col.push( empresaID );
            }
            
            mysql.query(`SELECT id, email FROM empresa WHERE ${where}`, col, function(err, res){
                if(err) return reject("erro interno ao verificar usuario");
                if(res.length == 0) return resolve();
                if(email && email == res[0].email) erros.email = 'em uso por outra conta';

                if(_.isEmpty(erros)) return resolve();
                return reject(erros);
            });
        });
    }
    
    /*
     * Valida os dados básicos da empresa (ao fazer o cadastro)
     */
    function validaAdd(empresa){
        return new Promise( function (resolve, reject) {
            const schema = Joi.object().options({ abortEarly: false }).keys({
                nome:   Joi.string().min(2).max(60).required(),// nome da pessoa
                empresa:   Joi.string().max(50).required(),// nome da empresa
                email:  Joi.string().email().max(100).required(),
                pass:   Joi.string().min(4).max(20).allow([null]),
                //ddd:    Joi.number().integer().min(1).required(),
                fone:   Joi.number().integer().positive().allow(['', null]),
                facebook_id:   Joi.string().max(120).allow([null]),
                profissionais:   Joi.number().integer().positive().max(255).allow(['', null])
            });

            
            Joi.validate(empresa, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);

                if(_.isEmpty(erros)) {
                    dadosEmUsoUser(empresa.email, null).then(function(){
                        return resolve(value);
                    }).catch(function(err){
                        return reject(err);
                    });
                }else return reject(erros);
            });
        });
    }
    
    /*
     * Quando esta atualizando os dados básicos da empresa, como o nome, segmento, etc
     * Incluindo os dados da unidae matriz
     */
    function validaEdit(userPerfil, empresaID, dados){       
        return new Promise( function (resolve, reject) {
            if(userPerfil != 'a') return reject('Você não tem permissão');
            
            const schema = Joi.object().options({ abortEarly: false }).keys({
                nome:   Joi.string().min(3).max(50).required(),
                slogan:   Joi.string().min(3).max(100).allow(['', null]),
                cnpj:  Joi.number().integer().positive().allow(['', null]),
                telefone:  Joi.number().integer().positive().required(),
                telefone2:  Joi.number().integer().positive().allow(['', null]),
                telefone3:  Joi.number().integer().positive().allow(['', null]),
                email:  Joi.string().email().required(),
                site:  Joi.string().uri({schema: [/https?/]}).max(120).allow(['', null]),
                uf:  Joi.string().min(2).max(2).allow(['', null]),
                cidade:  Joi.string().min(3).max(100).allow(['', null]),
                bairro:  Joi.string().min(3).max(100).allow(['', null]),
                endereco:  Joi.string().min(3).max(150).allow(['', null]),
                complemento:  Joi.string().min(3).max(250).allow(['', null]),
                cep:  Joi.number().integer().positive().allow(['', null])
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    dadosEmUsoUser(value.email, empresaID).then(function(){
                        return resolve(value);
                    }).catch(function(err){
                        return reject(err);
                    });
                }else return reject(erros);
            });
        });
    }
 

    exports.validaAdd = validaAdd;
    exports.validaEdit = validaEdit;
}());