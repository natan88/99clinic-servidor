;(function () {
    "use strict";

    const Joi = require("joi"),
        MyUtil = require("src/util/util.js"),
        mysql = require('src/util/conexoes.js'),
        // assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil,
        async = require('async'),
        _ = require('underscore'),
        schemaProntuario = require('./prontuario_joi').prontuario_schema,
        schemaModelos = require('./prontuario_joi').modelos_schema;


    /**
     * Recebe um usuário e checa se o mesmo é um profissional, se for um profissional
     * retorna o ID desse profissional, se não for rejeita
     * 
     * @param {int} empresaID PK da empresa
     * @param {int} userID PK do usuário
     */
    function checaProfissional ( empresaID, userID ) {
        return new Promise(function (resolve, reject) {
            mysql.query('SELECT id, ativo FROM profissional WHERE empresa_id = ? AND usuario_id = ? LIMIT 1', [empresaID, userID], (err, res) =>{
                if(err || !res) return reject("erro interno");
                if (res.length === 0) return reject('somente profissionais pode criar prontuários');
                if( res[0].ativo === 'n' ) return reject('Verifique sua autenticação');
                resolve( res[0].id );
            });
        });
    }

    function checaProntuario ( empresaID, userID, prontuarioID ) {
        return new Promise(function (resolve, reject) {
            let where = "empresa_id = ? AND usuario_id = ? AND (excluido IS NULL OR excluido='n') AND id ";
            if( Array.isArray(prontuarioID)) {
                where += 'IN(?)';
            } else {
                where += '= ?';
            }

            mysql.query(`SELECT count(*) AS total FROM prontuario WHERE ${where}`, [empresaID, userID, prontuarioID], (err, res) =>{
                if(err || !res) return reject("erro interno");
                
                if( Array.isArray(prontuarioID)) {
                    if (res[0].total !== prontuarioID.length ) return reject('Um ou mais prontuários não existe OU não pertence a você');
                } else {
                    if (res[0].total === 0) return reject('Esse prontuário não existe OU não pertence a você');
                }

                resolve( );
            });
        });
    }

    /**
     * Verifica se os campos que já estavam salvos (ao editar), esses campos
     * pertencem a empresa e ao profissional que esta realizando a atualização
     * 
     * Se encontrar, retorna o número da versão do campo
     */
    function checaCampos ( empresaID, userID, profissionalID, ids ) {
        return new Promise(function (resolve, reject) {
            // versão com JOIN que retorna apenas 1 versão, a maior
            mysql.query(`SELECT id, versao FROM prontuario_item WHERE empresa_id = ? AND usuario_id = ? AND profissional_id = ? AND id IN (?) ORDER BY versao DESC`, 
            [empresaID, userID, profissionalID, ids], (err, res) => {
                if(err || !res) return reject("erro interno");
                res = _.uniq( res, 'id', true); // remove os IDs duplicados
                if (res.length !== ids.length) return reject('Inconsistência nos campos, alguns parece não existir');
                resolve( res );
            });
        });
    }

    /**
     * Verifica se um usuário tem atendimento em andameto (status 4) e se o
     * prontuário que esta sendo editado esta presente nesse atedimento.
     * Essa verificação é feita para impedir que um prontuário seja atualizado
     * enquanto esta sendo usado, pois causaria inconsistência
     */
    function temAtendimentoEmAndamento ( empresaID, profissionalID, prontuarioID ) {
        return new Promise( (resolve, reject) => {
            if( !prontuarioID ) return resolve();
            mysql.query(`SELECT count(a.id) AS total FROM v_atendimento a 
                LEFT JOIN atendimento_has_prontuario_item pitem ON (pitem.atendimento_id = a.id)
                WHERE a.empresa_id = ? AND a.profissional_id = ? AND a.status = 4 AND 
                pitem.resposta IS NOT NULL AND pitem.prontuario_item_prontuario_id = ?`, 
            [empresaID, profissionalID, prontuarioID], (err, res) => {
                if(err || !res) return reject("erro interno");
                if( res[0].total > 0 ) return reject({tipoErro: 'atendimento', atendimentoEmCurso: res[0].total});
                resolve();
            });
        });
    }

    function valida(empresaID, userID, dados ) {
        return new Promise( (resolve, reject)=> {
            let data;

            const ValidacaoInicial = (callback) => {
                Joi.validate(dados, schemaProntuario, {context: {id: dados.id}}, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);

                    if(_.isEmpty(erros)) {
                        data = value;

                        data.campos.map( c => {
                            if( c.conf && _.isEmpty( c.conf )) delete c.conf;
                        });

                        callback(null, value);
                    }else return callback(erros);
                });
            };

            const Profissional = (callback) => {
                checaProfissional( empresaID, userID )
                .then( profissionalID => {
                    data.profissional_id = profissionalID;
                    callback();
                }).catch( err => callback( err ));
            };

            const Prontuario = (callback) => {
                if( !dados.id ) return callback();

                checaProntuario ( empresaID, userID, dados.id )
                .then( _retorno => callback() )
                .catch( err => callback( err ) );
            };

            const Campos = (callback) => {
                if( !dados.id ) {
                    // nenhum campo pode ter ID, já que o prontuário não existe ainda
                    let erros = {};
                    let i = 0;
                    dados.campos.map( c => {
                        if( c.id ) erros[i] = 'Não permitido nessa situação';
                        i++;
                    });

                    if( Object.keys(erros).length > 0 ) {
                        return callback({campos: erros});
                    }

                    return callback();
                }

                // pega apenas o ID dos campos que tem ID, para checar se os mesmos pertencem ao profissional
                let reduce = dados.campos.reduce( (acc, cur ) => {
                    if( cur.id ) acc.push( cur.id );
                    return acc;
                }, []);


                /**
                 * se não tiver campos já salvos (com ID), hão há necessidade de
                 * checar se os mesmos pertecem ao profissioal que esta tentando
                 * atualizá-los (na verdade, inseri-los)
                 */
                if( !reduce || reduce.length === 0 ) return callback();

                checaCampos ( empresaID, userID, data.profissional_id, reduce )
                .then( ( result ) => {
                    // agora, anexa a versão a cada campo
                    let erros = 0, temp;
                    result.map( c => {
                        temp = data.campos.find( d => d.id == c.id );
                        if( temp ) temp.versao = c.versao;
                        else erros++;
                    });

                    if( erros > 0 ) return callback('Erro interno ao checar campos atuais');

                    callback();
                }).catch( err => callback(err));
            };

            const AtendimentoEmCurso = (callback) => {
                if( !dados.id ) return callback();

                temAtendimentoEmAndamento ( empresaID, data.profissional_id, dados.id )
                .then( _retorno => callback() )
                .catch( err => callback( err ) );
            };

            async.series([ ValidacaoInicial, Profissional, Prontuario, Campos, AtendimentoEmCurso ], 
            (err, result)=> {
                if (err) return reject(err);
                
                return resolve( data );
            });
        });
    }

    /**
     * Validação simples, para operações como excluir, ativar/inativar
     * Checa se o prontuário existe e se pertence ao usuário/profissional que é
     * 'dono' do prontuário
     */
    function validaGenerico( empresaID, userID, prontuarioID ) {
        return new Promise( ( resolve, reject )=> {
            let profissionalID = null;
            const Profissional = (callback) => {
                checaProfissional( empresaID, userID )
                .then( _profissionalID => {
                    profissionalID = _profissionalID;
                    callback();
                }).catch( err => callback( err ));
            };

            const Prontuario = (callback) => {
                checaProntuario ( empresaID, userID, prontuarioID )
                .then( _retorno => callback() )
                .catch( err => callback( err ) );
            };

            async.parallel([ Profissional, Prontuario ], 
            (err, result)=> {
                if (err) return reject(err);
                
                resolve( profissionalID );
            });

        });
    }


    /**
     * Validação para atualizar o modelo de um campo de formulário do tipo
     * textarea
     * 
     * Faz as mesmas checagens de 'validaGenerico' e também verifica:
     * - se o campo existe (não pode está marcado como excluído)
     * - se o campo é do tipo textarea (único que tem modelos)
     */
    function validaModeloCampo( empresaID, userID, prontuarioID, campoID, modelos ) {
        return new Promise( ( resolve, reject )=> {
            let profissionalID = null, data = null, campoVersao;
            const Profissional = (callback) => {
                checaProfissional( empresaID, userID )
                .then( _profissionalID => {
                    profissionalID = _profissionalID;
                    callback();
                }).catch( err => callback( err ));
            };

            const Prontuario = (callback) => {
                checaProntuario ( empresaID, userID, prontuarioID )
                .then( _retorno => callback() )
                .catch( err => callback( err ) );
            };

            const Campo = (callback) => {
                mysql.query(`SELECT versao, tipo FROM prontuario_item WHERE id = ? AND (excluido IS NULL OR excluido='n') ORDER BY versao DESC LIMIT 1`, [ campoID ], ( err, result ) => {
                    if ( err || !result ) return callback("erro interno");
                    if ( result.length === 0 ) return callback('Esse campo não existe');
                    if ( result[0].tipo !== 'textarea' ) return callback('Modelos são compatíveis apenas com campo do tipo "texto longo"');
                    campoVersao = result[0].versao;
                    callback();
                });
            };

            const Modelos = (callback) => {
                Joi.validate(modelos, schemaModelos, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                    
                    if(_.isEmpty(erros)) {
                        data = value;
                        callback();
                    }else return callback(erros);
                });
            };

            async.parallel([ Modelos, Profissional, Prontuario, Campo ], 
            (err, result)=> {
                if (err) return reject(err);
                
                resolve( {profissionalID: profissionalID, campoVersao: campoVersao, modelos: data} );
            });

        });
    }

    exports.valida = valida;
    exports.validaGenerico = validaGenerico;
    exports.validaModeloCampo = validaModeloCampo;
}());