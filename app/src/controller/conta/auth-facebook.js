/* jshint -W030 */
{ 
    "use strict";

    /**
     * Faz o cadastro ou login via facebook
     */
    
     const 
        mysql = require('src/util/conexoes.js'),
        // conf = require('src/util/config'),
        _ = require('underscore'),
        async = require('async'),
        request = require('request').defaults({ encoding: null }),
        log = require('src/util/logInterno'),
        Autenticacao = require("./autenticacao").Autenticacao,
        Empresa = require("./empresa").Empresa,
        fs = require('fs'),
        Joi = require("joi"),
        MyUtil = require("src/util/util.js");

    class AuthFacebook {
        constructor( ) {
        }

        /**
         * REGRAS:
         * - se houver usuário com o ID do usuário facebook, considera usuário identificado
         * - se não houver usuário com o ID do usuário facebook e houver usuário com o mesmo email, considera esse(s) usuário(s)
         * - se não houver usuário identificado e não tiver e-mail do facebook, exibir o e-mail
         * - se não houver usuário identificado e tiver e-mail do facebook, cria uma nova conta
         * 
         * 
         * RETORNO
         * > Erros
         *   - exige a permissão E-MAIL
         *   - informa que é necessário e-mail
         * 
         * > Sucesso
         *   - nova conta criada, entra direto sem pedir mais nada
         *   - apenas 1 usuário identiricado, entra direto
         *   - mais de 1 usuário identificado, exibe uma lista de 
         * 
         * @param {String} authResponse.accessToken
         * @param {String} authResponse.userID
         * @param {String} authResponse.expiresIn
         * @param {String} authResponse.signedRequest
         * @param {String} authResponse.data_access_expiration_time
         */
        identificar( authResponse ) {
            return new Promise( ( resolve, reject ) => {
                let facebookDados;
                let empresas = [];
                let usuarioNaoCadastrado = false;
                
                async.series({

                    validaDados: ( callback ) => {
                        this._validaDados( authResponse ).then( result => {
                            authResponse = result;
                            callback();
                        }).catch( erro => {
                            callback( erro );
                        });
                    },
                    
                    dados: ( callback ) => {
                        this.getDadosFacebook( authResponse ).then( result => {
                            facebookDados = result;
                            callback();
                        }).catch( erro => {
                            callback( erro );
                        });
                    },

                    /**
                     * Insere o facebook_id no usuário
                     */
                    atualizaUsuarios: ( callback ) => {
                        if( !facebookDados.email ) return callback();

                        mysql.query('UPDATE usuario SET facebook_id = ? WHERE email = ? AND facebook_id IS NULL', [facebookDados.id, facebookDados.email], (err, result) => {
                            if( err || !result ) return callback('Erro interno');
                            callback();
                        });
                    },

                    /**
                     * Verifica se há usuário com email ou ID do facebook
                     */
                    getUser: ( callback ) => {
                        Autenticacao.idetificar( facebookDados.email || null, authResponse.userID ).then( _empresas => {
                            empresas = _empresas;
                            callback();
                        }).catch( erro => {
                            if( erro.email && erro.email === 'usuário não cadastrado' ) {
                                usuarioNaoCadastrado = true;
                                return callback();
                            }
                            callback(erro);
                        });
                    },

                    /**
                     * Se não tiver nenhum usuário, busca a empresa e seu usuário
                     * Só é usado se não for encontrado usuários no método "getUser"
                     */
                    getEmpresa: ( callback ) => {
                        if( empresas.length > 0 ) return callback(); // não precisa pesquisar 
                        if( !facebookDados || !facebookDados.email || !facebookDados.id ) return callback(); // não tem os dados necessários para verificar se há empresa

                        mysql.query(`SELECT MD5(u.id) AS id, u.id AS idOriginal, u.nome, u.perfil, u.ativo, u.facebook_id AS facebook, e.id AS eId, 
                            e.nome AS empresa, e.ativo AS eAtivo, e.aprovado
                            FROM empresa e
                            LEFT JOIN usuario u ON (u.empresa_id = e.id)
                            WHERE e.email = ? OR e.facebook_id = ? LIMIT 1`, 
                        [facebookDados.email, facebookDados.id], ( err, result ) => {
                            if( err || !result ) return callback();
                            if( result.length === 0 ) return callback();
                                      
                            empresas.push({
                                id: result[0].eId,
                                nome: result[0].empresa,
                                ativo: result[0].eAtivo,
                                aprovado: result[0].aprovado,
                                usuarios: [{
                                    id: result[0].id,
                                    idOriginal: result[0].idOriginal,
                                    nome: result[0].nome,
                                    perfil: result[0].perfil,
                                    ativo: result[0].ativo,
                                    empresaID: result[0].eId,
                                    facebook: true,
                                }]
                            });

                            // Insere o facebook_id no usuário
                            mysql.query('UPDATE usuario SET facebook_id = ? WHERE id = ? AND facebook_id IS NULL', [facebookDados.id, result[0].idOriginal], (err, result) => {
                                if( err || !result ) return callback('Erro interno');
                                callback();
                            });
                        });
                    },

                    cadastraEmpresa: ( callback ) => {
                        if( !usuarioNaoCadastrado || empresas.length > 0 ) return callback(); // não precisa cadastrar 
                        if( !facebookDados || !facebookDados.email ) return callback(); // não tem os dados necessários para cadastrar
                        
                        let empresa = {
                            nome: facebookDados.name,
                            empresa: 'consultório ' + facebookDados.name,
                            email: facebookDados.email,
                            facebook_id: facebookDados.id
                        };

                        Empresa.cadastra( empresa ).then(() => {
                            callback();
                        }).catch((err) => {
                            console.log('\n\n-> ERRO CONTA: ', err);
                            callback('Erro ao criar conta');
                        });
                    },

                    // faz o mesmo que "userExiste", porém depois de cadastrar a empresa
                    pegaUsuarios: (callback ) => {
                        if( empresas.length ) return callback();
                        Autenticacao.idetificar( facebookDados.email || null, authResponse.userID ).then( _empresas => {
                            empresas = _empresas;
                            callback();
                        }).catch( erro => {
                            callback(erro);
                        });
                    },

                    checaPermissao: ( callback ) => {
                        if( facebookDados.email || empresas.length ) return callback(); // se tem e-mail, não precisa checar a permissão
          
                        request.get(`https://graph.facebook.com/v5.0/${authResponse.userID}/permissions?access_token=${authResponse.accessToken}`, (error, response, body) => { 
                            if (error) {
                                return callback('Erro ao verificar permissões do facebook');
                            }
                            let permissoes = JSON.parse( body.toString() );
                            if( !permissoes.data ) return callback({facebookSemEmail: true});//Erro ao verificar permissões do facebook
                            permissoes = permissoes.data;
                            let emailPermitido = permissoes.findIndex( p => p.permission === 'email' && p.status === 'granted');
                            if( emailPermitido === -1 ) return callback({facebookSemEmail: true});
                            callback('Para entrar com o facebook é necessário ter um e-mail válido');
                        });
                    }
                },
                (err, result) => {
                    if( err ) return reject( err );
                    if( empresas.length === 0 ) return reject('Nenhum usuário encontrado');

                    resolve( { facebook: facebookDados, dados: empresas } );
                });
            });
        }// identificar

        getDadosFacebook( authResponse ) {
            return new Promise( ( resolve, reject ) => {
                request.get(`https://graph.facebook.com/v5.0/${authResponse.userID}?fields=name,email,picture&access_token=${authResponse.accessToken}&type=large`, (error, response, body) => { 
                    if (error) {
                        return reject( error );
                    }

                    let retorno = JSON.parse( body.toString() );
                    if( retorno.error ) {
                        let erro = 'Erro ao consulta o facebook';
                        // switch ( retorno.error.code ) {
                        //     case 4:
                        //         erro = 'Muitas chamadas de API';
                        //         break;
                        //     case 190:
                        //         erro = 'O token de acesso expirou';
                        //         break;
                        // }
                        return reject( erro );
                    }

                    resolve( retorno );
                });
                  
            });
        }// getDadosFacebook


        // NÃO ESTÁ EM USO
        getImagemFacebook(  userFacebookID, facebookImage ) {
            if( !facebookImage || !facebookImage.data ) return;
            if( facebookImage.data.is_silhouette ) return;
    
            request.get( facebookImage.data.url )
             .on('error', (err) => {
            })
            .pipe(fs.createWriteStream( `./temp/facebook_user_picture_${userFacebookID}.png` ));
        }

        /**
         * Validação inicial dos dados de autenticação vindo do facebook
         */
        _validaDados( authResponse ) {
            return new Promise( (resolve, reject ) => {
                const schema = Joi.object().options({ abortEarly: false }).keys({
                    accessToken:   Joi.string().required(),
                    userID:  Joi.string().regex(/^\d+$/, 'não é um número').required(),
                    expiresIn:  Joi.number().integer().positive().required(),
                    signedRequest:  Joi.string().required(),
                    graphDomain:  Joi.string(),
                    data_access_expiration_time:  Joi.number().integer().positive().required()
                });
                
                Joi.validate(authResponse, schema, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                    if(!_.isEmpty(erros)) {
                        return reject(erros);
                    }
                    
                    resolve(value);
                });
            });
        }

    } // fim classe

    module.exports = new AuthFacebook();
}