/*
 * A aplicação será dividida em partes
 * 
 * Este arquivo faz as coisas em sí, mas não recebe e nem devolve qualquer dado 
 * diretameente ao usuário
 *  
 */

;(function () {
    "use strict";
    

    const
        mysql = require('src/util/conexoes'),
        crypto = require('crypto'),
        uuid = require('uuid'),
        async = require('async'),
        Joi = require("joi"),
        request = require('request').defaults({ encoding: null }),
        MyUtil = require("src/util/util.js");
    
    let instance = null;

    function Autenticacao() {
        const self = this;

        self.logout         =  logout;
        self.fimSessao      =  fimSessao;
        self.apertoDeMao    = apertoDeMao;
        self.idetificar     = idetificar;
        self.entrar         = entrar;
        
        /*
         * Função chamada quando o usuário explicitamente pede para fazer "logout"
         * ou seja, não quer mais usar o token para se autenticar
         */
        function logout(userID, empresaID, token){
            let query = `UPDATE usuario_login SET ? WHERE usuario_id = ? AND empresa_id = ? AND token = ?`;
            mysql.query( query, [ {ativo: 'n', dt_logout: new Date()}, userID, empresaID, token ], (err, result) => {
            });
        }

        /**
         * Quando a sessão do usuário é encerrada
         * Sessão = período que o usuário está logado no websocket
         * @param {integer} sessaoID PK da sessão
         */
        function fimSessao( sessaoID ) {
            mysql.query( 'UPDATE usuario_sessao SET ? WHERE id = ?', [ { dt_fim: new Date()}, sessaoID ], (err, result) => {
            });
        }

        
        /*
         * Verifica se deve conceder autorização para a pessoa se conectar
         * origin não esta sendo usado por conta do express que não tem esse parametro da mesma forma que o websocket
         */
        function apertoDeMao(token, userAgent, origin ) {
            if( !userAgent ) userAgent = 'undefined';
            if( !origin ) origin = 'undefined';
            return new Promise( ( resolve, reject) => {
                let select = `SELECT l.id AS loginID, u.id, u.empresa_id, u.perfil, p.id AS profissional_id 
                    FROM usuario_login l
                    LEFT JOIN usuario u ON (u.id = l.usuario_id) 
                    LEFT JOIN empresa e ON (l.empresa_id = e.id) 
                    LEFT JOIN profissional p ON (l.usuario_id = p.usuario_id) 
                    WHERE 
                        l.token = ? AND 
                        l.user_agent = ? AND 
                        l.ativo = "s" AND 
                        u.ativo = "s" AND 
                        e.ativo="s" AND 
                        e.aprovado = "s" 
                    LIMIT 1`; // l.origin = ? AND  não esta em uso porque o express não passa corretamente esse valor
                
                let dados;
                async.series({
                      login: ( callback ) => {
                        mysql.query(select, [ token, userAgent, origin ], (err, result) => {
                            if(err) return callback('Erro ao processar a solicitação');
                            if(result.length == 0) return callback('token inválido');
                            dados = result[0];
                            callback( );
                        });
                    },
                    sessao: ( callback ) => {
                        let insert = {
                            usuario_login_id: dados.loginID,
                            usuario_id: dados.id,
                            empresa_id: dados.empresa_id
                        };
                        mysql.query(`INSERT usuario_sessao SET ?`, [insert], (err, result) => {
                            if( err || !result) return callback('Erro ao processar a solicitação');
                            dados.sessaoID = result.insertId;
                            callback( );
                        });
                    }
                }, ( erro, result ) => {
                    if( erro ) return reject( erro );
                    resolve( dados );
                });
            });
        } // apertoDeMao


        //---------------------  LOGIN EM 2 ETAPAS
        /**
         * Etapa 1 / 2 do novo login
         * Recebe um e-mail e identifica quais usuários usa este e-mail e quais,
         * retorna cada usuário encontrado, com a empresa e o seu perfil ( 
         * A = administrador
         * S = secretária
         * P = profissional
         * )
         * 
         * @param {string} email login do usuário
         * @param {string} facebookUserID login do usuário
         */
        function idetificar ( email, facebookUserID ) {
            return new Promise( ( resolve, reject) => {
                if( !email && !facebookUserID ) return reject('requisição inválida');

                let select = `MD5(u.id) AS id, u.nome, u.perfil, u.ativo, u.facebook_id AS facebook, e.id AS eId, 
                e.nome AS empresa, e.ativo AS eAtivo, e.aprovado
                FROM usuario u 
                LEFT JOIN empresa e ON (u.empresa_id = e.id)`;

                let where = '';
                let colunas = [];

                if( email ) {
                    where = 'u.email = ?';
                    colunas.push(email);
                }

                if( facebookUserID ) {
                    if( where !== '' ) where += ' OR ';
                    where += 'u.facebook_id = ?';
                    colunas.push(facebookUserID);
                }

                mysql.query(`SELECT ${select} WHERE ${where}`, colunas, (err, result) => {
                    if ( err || !result ) return reject('Erro ao processar a solicitação');
                    if ( result.length == 0 ) return reject({email: 'usuário não cadastrado' });

                    let empresas = [];
                    let _empresa; // temp

                    let usuarios = result.map( u => {
                        _empresa = {
                            id: u.eId,
                            nome: u.empresa,
                            ativo: u.eAtivo,
                            aprovado: u.aprovado
                        };

                        if( empresas.findIndex( e => e.id == u.eId ) == -1 ) {
                            empresas.push( _empresa );
                        }

                        return {
                            id: u.id,
                            nome: u.nome,
                            perfil: u.perfil,
                            ativo: u.ativo,
                            empresaID: u.eId,
                            facebook: u.facebook ? true : false,
                        };
                    });

                    // junta empresa e usuários
                    for (const e of empresas ) {
                        e.usuarios = usuarios.filter( u => u.empresaID == e.id );
                    }

                    resolve( empresas );
                });
   
            });
        }

        /**
         * 
         * @param {string} dados.email login do usuário
         * @param {string} dados.senha senha do usuário
         * @param {string} dados.usuarioID MD5 do ID do usuário.
         * @param {string} dados.userAgent informações do navegador, fornecido pelo express
         * @param {string} dados.origin site onde o usuário fez a solicitação, fornecido pelo express
         * @param {string} dados.origin site onde o usuário fez a solicitação, fornecido pelo express
         * 
         * @param {string} dados.facebook.accessToken 
         * @param {string} dados.facebook.userID
         * @param {string} dados.facebook.expiresIn
         * @param {string} dados.facebook.signedRequest
         * @param {string} dados.facebook.data_access_expiration_time
         */
        function entrar ( dados ) {
            return new Promise( function ( resolve, reject){

                let token = uuid.v1();
                let dadosUser;
                let facebookDados;

                async.series({

                    validar: ( callback ) => {
                        _validaEntrar( dados ).then( _data => {
                            dados = _data;
                            callback();
                        }).catch( erro => {
                            callback(erro);
                        });
                    },

                    getDadosFacebook: ( callback ) => {
                        if( !dados.facebook ) return callback(); // não precisa
                        
                        request.get(`https://graph.facebook.com/v5.0/${dados.facebook.userID}?fields=name,email,picture&access_token=${dados.facebook.accessToken}&type=large`, (error, response, body) => { 
                            if (error) {
                                return callback( 'Erro interno ao consultar facebook' );
                            }
        
                            facebookDados = JSON.parse( body.toString() );
                            if( facebookDados.error ) {
                                return callback( 'Erro ao consulta o facebook' );
                            }
        
                            callback();
                        });
                    },

                    getDadosDB: ( callback ) => {
                        let where = 'MD5(u.id) = ?';
                        let col = [dados.usuarioID];

                        let select = `SELECT u.id, u.ativo, u.nome, u.empresa_id, e.ativo AS eativa, e.nome AS empresa, e.aprovado 
                            FROM usuario u 
                            LEFT JOIN empresa e ON (u.empresa_id = e.id) `;

                        if( dados.facebook ) {
                            where += ' AND u.facebook_id = ?';
                            col.push(facebookDados.id);
                        } else {
                            const md5 = crypto.createHash('md5').update(dados.senha).digest('hex');
                            where += ' AND u.email = ? AND u.senha = ?';
                            col.push(dados.email, md5);
                        }
                        
                        mysql.query(`${select} WHERE ${where} LIMIT 1`, col, (err, result) => {
                            if(err) return callback('Erro ao processar a solicitação');
                            if(!result) return callback('Login ou senha inválido');
                            if(result.length == 0) return callback('Login ou senha inválido');
                            dadosUser = result[0];
                            if(dadosUser.eativa != 's') return callback('A empresa "' + dadosUser.empresa + '" não esta ativa');
                            if(dadosUser.ativo != 's') return callback('Sua conta não esta ativa');
                            if(dadosUser.aprovado != 's') return callback( { empresa: dadosUser.empresa } );// cadastro da empresa não aprovado, exibir link de ativação do cadastro
        
                            callback();
                        });
                    },

                    registraLogin: ( callback ) => {
                        let insert= {
                            usuario_id: dadosUser.id,
                            empresa_id: dadosUser.empresa_id,
                            token: token,
                            user_agent: dados.userAgent || 'undefined',
                            origin: dados.origin || 'undefined'
                        };
    
                        mysql.query('INSERT usuario_login SET ?', [insert], (erro, result) => {
                            if( erro || !result ) return callback('Erro ao processar a solicitação');                        
                            callback();
                        });
                    }

                }, (err, result) => {
                    if( err ) return reject( err );
                    resolve( token );
                });
            });
        }
        //---------------------  fim LOGIN EM 2 ETAPAS

        function _validaEntrar( dados ) {
            return new Promise( (resolve, reject ) => {
                const schema = Joi.object().options({ abortEarly: false }).keys({
                    usuarioID:  Joi.string().uuid().required(),
                    userAgent:  Joi.string().allow(['', null]),
                    origin:  Joi.string().allow(['', null]),

                    facebook:  Joi.object().options({ abortEarly: false }).keys({
                        accessToken:   Joi.string().required(),
                        userID:  Joi.string().regex(/^\d+$/, 'não é um número').required(),
                        expiresIn:  Joi.number().integer().positive().required(),
                        signedRequest:  Joi.string().required(),
                        graphDomain:  Joi.string(),
                        data_access_expiration_time:  Joi.number().integer().positive().required()
                    })
                }).when(Joi.object({ facebook: {is: Joi.exist()} }).unknown(), {
                    then: Joi.object({
                        email:   Joi.string().email().required(),
                        senha:  Joi.string().required(),
                    }),
                    otherwise: Joi.object({
                        email: Joi.any().strip(),
                        senha: Joi.any().strip()
                    })
                })
                
                Joi.validate(dados, schema, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                    if(!_.isEmpty(erros)) {
                        return reject(erros);
                    }
                    
                    resolve(value);
                });
            });
        }

    }
    
    if(instance === null) instance = new Autenticacao();
    module.exports = Autenticacao;
    Autenticacao.Autenticacao = instance;
}());