;(function () {
    "use strict";
    
    const Joi = require("joi"),
        Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        async = require('async'),
        crypto = require('crypto');
    


    // verifica se e-mail está em uso por outro usuário da mesma empresa e com o mesmo perfil
    function dadosEmUso(empresaID, email, perfil, id){
        return new Promise( function (resolve, reject) {
            let where = 'email = ? AND empresa_id = ? AND perfil = ?';
            let col = [email, empresaID, perfil];
            if(id) {
                where += ' AND id != ?';
                col.push(id);
            }
            mysql.query('SELECT COUNT(*) AS count FROM usuario WHERE '+where, col, function(err, res){
                if(err) return reject("erro interno");
                if(res[0].count > 0 ) return reject({email: 'em uso'});
                return resolve();
            });
        });
    }
    
    /**
     * verifica se o usuário pertence a empresa
     * Também serve para pegar os dados antigos do usuário e o nome da empresa
     */
    function usuarioDaEmpresa(empresaID, userID){
        return new Promise( function (resolve, reject) { 
            let where = 'u.empresa_id = ?';
            let dados = [ empresaID ];
            
            if( userID ) {
                where += ' AND u.id = ?';
                dados.push( userID );
            }

            mysql.query(`SELECT u.*, e.nome AS empresaNome
            FROM usuario u
            LEFT JOIN empresa e ON (e.id = u.empresa_id)
            WHERE ${where} LIMIT 1`, dados, function(err, res){
                if ( err || !res ) return reject("erro interno");
                if ( userID && res.length === 0 ) return reject({nome: 'Este usuário não existe'});
                if ( !userID && res.length === 0 ) return reject('A empresa parece não existir');

                return resolve( res[0] );
            });
        });
    }
    
    // verifica se uma senha pertence mesmo ao usuário
    function senhaConfere(empresaID, userID, senha){
        return new Promise( function (resolve, reject) { 
            senha = crypto.createHash('md5').update(senha).digest('hex');
            mysql.query('SELECT COUNT(*) AS count FROM usuario WHERE id = ? AND empresa_id = ? AND senha = ?', [userID, empresaID, senha], function(err, res){
                if(err) return reject("erro interno");
                if(res[0].count == 0 ) return reject({senhaA: 'A senha não confere'});
                return resolve();
            });
        });
    }
    
    /*
     * Validação da alteração do usuário logado
     */
    function validaMe(empresaID, user, dados) {
        return new Promise( function (resolve, reject) {
            let dadosAntigos;
            const schema = Joi.object().options({ abortEarly: false }).keys({
                nome:   Joi.string().min(3).max(100).required(),
                email:  Joi.string().email().max(60).required(),
                fone:   Joi.number().integer().positive().allow(['', null]),
                celular:Joi.number().integer().positive().allow(['', null])
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    
                    async.parallel({
                        emailEmUso: (callback) => {
                            dadosEmUso(empresaID, dados.email, user.perfil, user.id).then(() => {
                                callback();
                            }).catch((erro) => {
                                callback(erro);
                            });
                        },
                        userDaEmpresa: (callback) => {
                            usuarioDaEmpresa(empresaID, user.id).then( ( _dadosAntigos ) => {
                                dadosAntigos = _dadosAntigos;
                                callback();
                            }).catch((erro) => {
                                callback(erro);
                            });
                        }
                    },
                    (err) => {
                        if(err) return reject(err);
                        resolve( { dados: value, dadosAntigos: dadosAntigos } );
                    });
                    
                }else return reject(erros);
            });
        });
    }
    
    /*
     * Valida senha do usuário logado.
     */
    function validaMeSenha(empresaID, userID, senhas) {
        return new Promise( function (resolve, reject) {
            
            const schema = Joi.object().options({ abortEarly: false }).keys({
                senhaA: Joi.string().min(3).max(20).required().strip(),
                senha:  Joi.string().min(3).max(20).required(),
                senha2: Joi.any().valid(Joi.ref('senha')).required().options({ language: { any: { allowOnly: 'Não confere' } } }).strip()
            });
            
            Joi.validate(senhas, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    
                    async.parallel({
                        userDaEmpresa: function(callback) {
                            usuarioDaEmpresa(empresaID, userID).then(function(){
                                callback();
                            }).catch(function(erro){
                                callback(erro);
                            });
                        },
                        senha: function(callback) {
                            senhaConfere(empresaID, userID, senhas.senhaA).then(function(){
                                callback();
                            }).catch(function(erro){
                                callback(erro);
                            });
                        }
                    },
                    function(err){
                        if(err) return reject(err);
                        resolve(value);
                    });
                    
                }else return reject(erros);
            });
        });
    }//validaMeSenha
    
    /*
     * Valida os dados do usuário.
     * Somente para
     */
    function validaUsuario(empresaID, userPerfil, dados) {
        return new Promise( (resolve, reject)=> {
            if(userPerfil != 'a') return reject('Você não tem permissão');
            let dadosAntigos;
            const schema = Joi.object().options({ abortEarly: false }).keys({
                id:     Joi.number().integer().positive().allow(''),
                profissional_id:  Joi.number().integer().positive().allow([null, '']).strip(),// para evitar erros
                online:  Joi.boolean().allow([null, '']).strip(),// para evitar erros
                nome:   Joi.string().min(3).max(60).required(),
                perfil: Joi.string().length(1).lowercase().regex(/^(a|s)$/, 'Valora aceito: Administrador e Secretária').required(),// não tem o perfil 'p' do profissional pois é através do profissional que cria esse usuário.
                email:  Joi.string().email().max(100).required(),
                fone:   Joi.number().integer().positive().allow(['', null]),
                celular:Joi.number().integer().positive().allow(['', null]),
                // senha:  Joi.string().min(3).max(20).allow(['', null]),
                senha: Joi.any().when('id', { 
                    is: Joi.exist(), 
                    then: Joi.any().strip(), 
                    otherwise: Joi.string().regex(/^(gerar|link)$/).required()
                }),
                ativo:  Joi.string().length(1).lowercase().regex(/^(s|n)$/).required()
            });
            
            Joi.validate(dados, schema, (err, value)=> {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    
                    async.parallel({
                        emailEmUso: (callback)=> {
                            dadosEmUso(empresaID, dados.email, dados.perfil, dados.id || null).then(()=>{
                                callback();
                            }).catch((erro)=>{
                                callback(erro);
                            });
                        },
                        userDaEmpresa: (callback)=> {
                            usuarioDaEmpresa(empresaID, dados.id || null).then(( _dadosAntigos )=>{
                                dadosAntigos = _dadosAntigos;
                                callback();
                            }).catch((erro)=>{
                                callback(erro);
                            });
                        },
                        /*
                        * Se tiver editando, checa se o usuário teve o perfil alterado de
                        * 'profissional' (p) para outro qualuqer, isso não é permitido
                        */
                        eProfissional: (callback) => {
                            if( !dados.id ) return callback(); // se não for editar, não há o que fazer
                            mysql.query('SELECT perfil FROM usuario WHERE id = ? AND empresa_id = ? LIMIT 1', [dados.id, empresaID], (err, result) => {
                                if( err ) return callback('Erro interno');
                                if( !result || result.length != 1 ) return callback('usuário não localizado');
                                if( result[0].perfil == 'p' ) return callback('Para atualizar um profissional, acesse o menu profissionais');
                                callback();
                            });
                        }
                    },
                    (err, result)=> {
                        if(err) return reject(err);
                        resolve( {dados: value, dadosAntigos: dadosAntigos} );
                    });
                    
                }else return reject(erros);
            });
        });
    }
    
    
    function validaRedefinirSenha(dados) {
        return new Promise( function (resolve, reject) {
            
            const schema = Joi.object().options({ abortEarly: false }).keys({
                token: Joi.string().guid({version: 'uuidv1'}).required(),
                tokenID: Joi.string().regex(/^[a-f0-9]{32}$/, 'dados inconsistentes').required(),// é um MD5
                senha:  Joi.string().min(3).max(20).required(),
                senha2: Joi.any().valid(Joi.ref('senha')).required().options({ language: { any: { allowOnly: 'Não confere' } } }).strip()
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    resolve(value);
                }else {
                    if(erros.token || erros.tokenID) {
                        return reject('Acesso incorreto');
                    }
                    if( dados.senha && dados.senha2 && dados.senha != dados.senha2) {
                        erros.senha2 = 'Não confere. Senhas diferentes';
                    }
                    return reject(erros);
                }
            });
        });
    }//validaMeSenha
    
    /**
     * Valida a recuperação da senha, ou seja, a solicitação de envio do link
     * de recuperação de senha
     */
    function validaRecuperaSenha(dados) {
        return new Promise( function (resolve, reject) {
            
            const schema = Joi.object().options({ abortEarly: false }).keys({
                email: Joi.string().email().required(),
                usuarioID: Joi.string().regex(/^[a-f0-9]{32}$/, 'dados inconsistentes').required(),// é um MD5
                empresaID: Joi.number().integer().positive().min(1).required()
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                if(_.isEmpty(erros)) {
                    resolve(value);
                }else {
                    return reject(erros);
                }
            });
        });
    }//validaRecuperaSenha
 

    exports.validaUsuario = validaUsuario;
    exports.validaMe = validaMe;
    exports.validaMeSenha = validaMeSenha;
    exports.validaRedefinirSenha = validaRedefinirSenha;
    exports.validaRecuperaSenha = validaRecuperaSenha;
}());