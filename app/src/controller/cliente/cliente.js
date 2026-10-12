;(function () {
    "use strict";    

    let Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        validacao = require("./cliente-validacao"),
        async = require('async'),
        _ = require('underscore'),
        evento = require('src/eventos/eventosInternos');
    
    let instance = null;

    function Cliente() {
        let self = this;
        
        /*
         * Exporta os pacientes. Não estou usando a função self.getPacientes
         * para não retornar a data de cadastro e a imagem além de ter um
         * número de resultados por página diferente
         */
        self.exporta = function(empresaID, pagina) {
            return new Promise( function (resolve) {
                let max = 1000;
                pagina = parseInt(pagina) || 1;
                pagina = (pagina - 1) * max;
                let sql = `SELECT id, nome, COALESCE(DATE_FORMAT(nascimento, "%Y-%m-%d"), '') AS nascimento, COALESCE(sexo, '') AS sexo, 
                    COALESCE(cpf, '') AS cpf, COALESCE(rg, '') AS rg, COALESCE(rg_orgao, '') AS rg_orgao, 

                    CASE 
                        WHEN ec = 'so' THEN "solteiro"
                        WHEN ec = 'ca' THEN "casado"
                        WHEN ec = 'ue' THEN "união estável"
                        WHEN ec = 'vv' THEN "viúvo"
                        WHEN ec = 'se' THEN "separado"
                        WHEN ec = 'dv' THEN "divorciado"
                        ELSE ""
                    END AS estado_civil,

                    COALESCE(uf, '') AS uf, COALESCE(cidade, '') AS cidade, COALESCE(bairro, '') AS bairro, COALESCE(endereco, '') AS endereco, 
                    COALESCE(complemento, '') AS complemento, COALESCE(cep, '') AS cep, COALESCE(nota,'') AS nota, COALESCE(nota_contato, '') AS nota_contato
                    FROM cliente p WHERE p.empresa_id = ? AND demo !="s" ORDER BY id ASC LIMIT ?,?`;
                selectUsuarioCompleto(sql, [empresaID, pagina, max]).then(function(result){
                    resolve(result);
                });
            });
        };
        
        self.getPacientes = function(empresaID, pagina) {
            return new Promise( function (resolve) {
                let max = 9;
                pagina = parseInt(pagina) || 1;
                pagina = (pagina - 1) * max;
                let sql = `SELECT id, nome, dt_cadastro, DATE_FORMAT(nascimento, "%Y-%m-%d") AS nascimento, sexo, cpf, rg, rg_orgao, ec, uf, cidade, bairro, endereco, complemento, cep, nota, nota_contato, img, demo
                           FROM cliente p WHERE p.empresa_id = ? ORDER BY id ASC LIMIT ?,?`;
                selectUsuarioCompleto(sql, [empresaID, pagina, max]).then(function(result){
                    resolve(result);
                });
            });
        };
        
        self.getTotalPacientes = function(empresaID) {
            return new Promise( function (resolve) {
                mysql.query('SELECT count(*) AS total FROM cliente WHERE empresa_id = ?', [empresaID], function(err, result){
                    if(err || !result) return resolve(0);
                    resolve(result[0].total);
                });
            });
        };
        
        self.getPaciente = function(empresaID, pacienteID) {
            return new Promise( function (resolve) {
                let sql = `SELECT id, nome, dt_cadastro, DATE_FORMAT(nascimento, "%Y-%m-%d") AS nascimento, sexo, cpf, rg, rg_orgao, ec, uf, cidade, bairro, endereco, complemento, cep, nota, nota_contato, img, demo 
                           FROM cliente p WHERE p.empresa_id = ? AND id = ? LIMIT 1`;
                selectUsuarioCompleto(sql, [empresaID, pacienteID]).then(function(result){
                    resolve(result[0]);
                });
            });
        };
        
        self.busca = function(empresaID, dado, pagina) {
            return new Promise( function (resolve) {
                let max = 9;
                pagina = parseInt(pagina) || 1;
                pagina = (pagina - 1) * max;
                let sql = `SELECT id, nome, dt_cadastro, DATE_FORMAT(nascimento, "%Y-%m-%d") AS nascimento, sexo, cpf, rg, rg_orgao, ec, uf, cidade, bairro, endereco, complemento, cep, nota, nota_contato, img, demo 
                           FROM cliente WHERE empresa_id = ? AND (nome LIKE ? OR cpf LIKE ? OR txt_busca LIKE ?) ORDER BY id ASC LIMIT ?,?`;
                selectUsuarioCompleto(sql, [empresaID, '%'+dado+'%', '%'+dado+'%', '%'+dado+'%', pagina, max]).then(function(result){
                    resolve(result);
                });
            });
        };
        
        self.getTotalBusca = function(empresaID, dado) {
            return new Promise( function (resolve) {
                mysql.query('SELECT count(*) AS total FROM cliente WHERE empresa_id = ? AND (nome LIKE ? OR cpf LIKE ? OR txt_busca LIKE ?)', [empresaID, '%'+dado+'%', '%'+dado+'%', '%'+dado+'%'], function(err, result){
                    if(err || !result) return resolve(0);
                    resolve(result[0].total);
                });
            });
        };
        
        /*
         * Adiciona um novo cliente
         * Somente administrador
         * 
         * permiteNomesDuplicados = se é para permitir nomes duplicados
         */
        self.add = function(empresaID, userID, userPerfil, dados, permiteNomesDuplicados) {
            return new Promise( function ( resolve, reject){
                let data;
                let clienteID = null;
                let validar =  function(callback) {
                    validacao.valida(empresaID, userPerfil, dados, permiteNomesDuplicados).then(function(_data){
                        data = _data;
                        callback(null, null);
                    }).catch(function(erro){
                        callback(erro, null);
                    });
                };
                
                let conexao;
                let transaction = function(callback) {
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno', null);}
                            callback(null, null);
                        });
                    });
                };
                
                let Paciente = function(callback){
                    let insert = _.omit(data, ['email', 'telefone', 'celular']);
                    insert.empresa_id = empresaID;
                    insert.txt_busca = _.union(data.email, data.telefone, data.celular);
                    insert.txt_busca = insert.txt_busca.toString();
                    
                    if(!insert.nascimento)  insert.nascimento = null;
                    if(!insert.rg)    insert.rg = null;
                    if(!insert.rg_orgao)    insert.rg_orgao = null;
                    if(!insert.cpf)   insert.cpf = null;
                    if(!insert.cep)   insert.cep = null;
                    if(!insert.ec)    insert.ec = null; 
                    if(!insert.sexo)    insert.sexo = null; 
                    
                    conexao.query('INSERT INTO cliente SET ?', [insert], function(err, result){
                        if(err || result.length === 0) return callback('Erro interno ao registra paciente', null);
                        clienteID = result.insertId;
                        callback(err, result.insertId);
                    });
                };
                
                let Telefone = function(callback){
                    if(_.isEmpty(data.telefone)) return callback(null, null);
                    let dados = [];
                    
                    async.each(data.telefone, function(tel, callbackEach){
                        if(_.isNumber(tel))
                            dados.push([empresaID, clienteID, tel]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(dados)) return callback(null, null);
                        conexao.query('INSERT INTO cliente_fone (empresa_id, cliente_id, num) VALUES ?', [dados], function(err, result){
                            if(err || result.length === 0) return callback('Erro interno ao registrar telefone', null);
                            callback(err, null);
                        });
                    });
                };
                
                let Celular = function(callback){
                    if(_.isEmpty(data.celular)) return callback(null, null);
                    let dados = [];
                    
                    async.each(data.celular, function(cel, callbackEach){
                        if(_.isNumber(cel))
                            dados.push([empresaID, clienteID, cel]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(dados)) return callback(null, null);
                        
                        conexao.query('INSERT INTO cliente_celular (empresa_id, cliente_id, num) VALUES ?', [dados], function(err, result){
                            if(err || result.length === 0) return callback('Erro interno ao registrar celular', null);
                            callback(err, null);
                        });
                    });
                };
                
                let Email = function(callback){
                    if(_.isEmpty(data.email)) return callback(null, null);
                    let dados = [];
                    
                    async.each(data.email, function(email, callbackEach){
                        if(!_.isEmpty(email))
                            dados.push([empresaID, clienteID, email]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(dados)) return callback(null, null);
                        
                        conexao.query('INSERT INTO cliente_email (empresa_id, cliente_id, email) VALUES ?', [dados], function(err, result){
                            if(err || result.length === 0) return callback('Erro interno ao registrar e-mail', null);
                            callback(err, null);
                        });
                    });
                };
                
                // processa
                async.series({
                    valida: validar,
                    transaction: transaction,
                    paciente: Paciente,
                    telefone: Telefone,
                    celular: Celular,
                    email: Email
                },
                function(err, result){
                    // aqui será feito o comit ou rollback
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(function(){conexao.release();});
                    }else{
                        conexao.commit(function(err) {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback(function(){conexao.release();});
                            }else {
                                resolve(clienteID);
                                conexao.release();
                            }
                        });
                    }
                });
            });
        };//add
        
        /*
         * Atualiza um paciente
         */
        self.edit = function(empresaID, userID, userPerfil, dados, permiteNomeDuplicado) {
            return new Promise( function ( resolve, reject) {
                dados = _.omit(dados, ['dt_cadastro', 'img']);
                let data;
                let clienteID;
                let validar =  function(callback) {
                    validacao.valida(empresaID, userPerfil, dados, permiteNomeDuplicado).then(function(_data){
                        if(!_.has(_data, 'id')) return callback('Este paciente parece não existir', null);
                        data = _data;
                        clienteID = data.id;
                        callback(null, null);
                    }).catch(function(erro){
                        callback(erro, null);
                    });
                };
                
                let conexao;
                const transaction = (callback) => {
                    let pool = mysql.pool;
                    pool.getConnection( (err, connection) => {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction( (err) => {
                            if (err) { return callback('erro interno', null);}
                            callback(null, null);
                        });
                    });
                };
                
                let Paciente = function(callback){
                    let update = _.omit(data, ['email', 'telefone', 'celular', 'id']);
                    update.txt_busca = _.union(data.email, data.telefone, data.celular);
                    update.txt_busca = update.txt_busca.toString();
                    
                    if(!update.nascimento)  update.nascimento = null;
                    if(!update.rg)    update.rg = null;
                    if(!update.rg_orgao) update.rg_orgao = null;
                    if(!update.cpf)   update.cpf = null;
                    if(!update.cep)   update.cep = null;
                    if(!update.ec)    update.ec = null; 
                    if(!update.sexo)  update.sexo = null; 
                   
                    conexao.query('UPDATE cliente SET ? WHERE id = ? AND empresa_id = ?', [update, clienteID, empresaID], function(err, result){
                        if(err || result.length === 0) return callback('Erro interno ao registra paciente', null);
                        callback(err, null);
                    });
                };
                
                let Exclusao = function(callbackExclusao) {
                   async.parallel({
                        telefone: function(callback){
                            conexao.query('DELETE FROM cliente_fone WHERE cliente_id = ? AND empresa_id = ?', [clienteID, empresaID], function(err){
                                callback((err ? 'Erro interno' : null), null);
                            });
                        },
                        celular: function(callback){
                            conexao.query('DELETE FROM cliente_celular WHERE cliente_id = ? AND empresa_id = ?', [clienteID, empresaID], function(err){
                                callback((err ? 'Erro interno' : null), null);
                            });
                        },
                        email: function(callback){
                            conexao.query('DELETE FROM cliente_email WHERE cliente_id = ? AND empresa_id = ?', [clienteID, empresaID], function(err){
                                callback((err ? 'Erro interno' : null), null);
                            });                            
                        }
                    }, function(err){
                        callbackExclusao(err, null);
                    });
                };
                
                let Telefone = function(callback){
                    if(_.isEmpty(data.telefone)) return callback(null, null);
                    let _dados = [];
                    
                    async.each(data.telefone, function(tel, callbackEach){
                        if(_.isNumber(tel))
                            _dados.push([empresaID, clienteID, tel]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(_dados)) return callback(null, null);
                        
                        conexao.query('INSERT INTO cliente_fone (empresa_id, cliente_id, num) VALUES ?', [_dados], function(err, result){
                            if(err || result.length === 0) return callback('Erro interno ao registrar telefone', null);
                            callback(err, null);
                        });
                    });
                };
                
                let Celular = function(callback){
                    if(_.isEmpty(data.celular)) return callback(null, null);
                    let _dados = [];
                    
                    async.each(data.celular, function(cel, callbackEach){
                        if(_.isNumber(cel))
                            _dados.push([empresaID, clienteID, cel]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(_dados)) return callback(null, null);
                        
                        conexao.query('INSERT INTO cliente_celular (empresa_id, cliente_id, num) VALUES ?', [_dados], function(err, result){
                            if(err || result.length === 0) return callback('Erro interno ao registrar celular', null);
                            callback(err, null);
                        });
                    });
                };
                
                let Email = function(callback){
                    if(_.isEmpty(data.email)) return callback(null, null);
                    let _dados = [];
                    
                    async.each(data.email, function(email, callbackEach){
                        if(!_.isEmpty(email))
                            _dados.push([empresaID, clienteID, email]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(_dados)) return callback(null, null);
                        
                        conexao.query('INSERT INTO cliente_email (empresa_id, cliente_id, email) VALUES ?', [_dados], function(err, result){
                            if(err || result.length === 0) return callback('Erro interno ao registrar e-mail', null);
                            callback(err, null);
                        });
                    });
                };
                
                // processa
                async.series({
                    valida: validar,
                    transaction: transaction,
                    paciente: Paciente,
                    exclusao: Exclusao,
                    telefone: Telefone,
                    celular: Celular,
                    email: Email
                },
                function(err, result){
                    // aqui será feito o comit ou rollback
                    if(err) {
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject(err);
                    }
                    conexao.commit( (err) => {
                        if(err) {
                            conexao.rollback( () => conexao.release() );
                            return reject('Erro interno');
                        }
                        conexao.release();
                        resolve(clienteID);

                        evento.emit( 'paciente.edit', empresaID, clienteID, data );
                    });
                });
            });
        };//edit
        
        /*
         * Remove um paciente
         * Somente administrador tem permissão
         */
        self.del = function(empresaID, userID, perfil, clienteID) {
            return new Promise( function ( resolve, reject ){
                if(perfil !== 'a') return reject('Você não tem permissão para excluir pacientes');

                async.series({
                    pacienteExiste: ( callback ) => {
                        mysql.query('SELECT id FROM cliente WHERE id = ? AND empresa_id = ? LIMIT 1', [clienteID, empresaID], (err, result) => {
                            if( err || !result ) return callback('Erro ao consultar paciente');
                            if( result.length == 0 ) return callback('Paciente não existe');
                            callback();
                        });
                    },
                    temAtendimento: ( callback ) => {
                        mysql.query('SELECT count(*) AS total FROM atendimento WHERE cliente_id = ? AND empresa_id = ?', [clienteID, empresaID], (err, count)=> {
                            if(err || !count) return callback("Erro interno");
                            let total = count[0].total;
                            if(!_.isNumber(total)) return callback("Erro interno");
                            if(total > 0) return reject(`Paciente com ${total} atendimento(s). Não pode ser excluído`);
                            callback();
                        });
                    },
                    excluipaciente: ( callback ) => {
                        mysql.query('DELETE FROM cliente WHERE id = ? AND empresa_id = ?', [clienteID, empresaID], (err, result) => {
                            if( err || !result ) return callback('Erro interno');
                            if( result.affectedRows != 1 ) return callback('Nenhum paciente excluído!');
                            callback();
                        });
                    }
                }, (erro) => {
                    if( erro ) return reject( erro );
                    resolve();
                    evento.emit( 'paciente.del', empresaID, clienteID );
                });                
            });
        };//del
        
        
        /*
         * Busca um CLIENTE completo (com todos os dados)
         * Recebe a query de consulta
         * @param {string} query
         * @param {array} busca
         * @param {int} empresaID
         */
        function selectUsuarioCompleto(_query, busca){            
            return new Promise( function (resolve) {
                let sqlFone     = 'SELECT num FROM cliente_fone WHERE cliente_id = ?';
                let sqlCelular  = 'SELECT num FROM cliente_celular WHERE cliente_id = ?';
                let sqlEmail    = 'SELECT email FROM cliente_email WHERE cliente_id = ?';
                
                let pacientes = [];
                mysql.query(_query, busca, function(err, result){
                    if(err || result.length < 1) return resolve([]);
                    
                    async.each(result, function(p, callback){
                        processaUser(p, callback);
                    }, function(){
                        resolve(pacientes);
                    });
                });
                
                let processaUser = function(p, callbackEach) {
                   async.parallel({
                        telefone: function(callback){
                            mysql.query(sqlFone, [p.id], function(err, result){
                                if(err || result.length < 1) return callback(err, null);
                                async.map(result, function(item, cal){cal(null, item.num);}, function(err, results) {
                                    return callback(null, results);
                                });
                            });
                        },
                        celular: function(callback){
                            mysql.query(sqlCelular, [p.id], function(err, result){
                                if(err || result.length < 1) return callback(err, null);
                                async.map(result, function(item, cal){cal(null, item.num);}, function(err, results) {
                                    return callback(null, results);
                                });
                            });
                        },
                        email: function(callback){
                            mysql.query(sqlEmail, [p.id], function(err, result){
                                if(err || result.length < 1) return callback(err, null);
                                async.map(result, function(item, cal){cal(null, item.email);}, function(err, results) {
                                    return callback(null, results);
                                });
                            });
                        }
                    }, function(err, result){
                        p.telefone = [];
                        p.celular = [];
                        p.email = [];
                        if(result.telefone) p.telefone = result.telefone;
                        if(result.celular) p.celular = result.celular;
                        if(result.email) p.email = result.email;

                        pacientes.push(p);
                        callbackEach();
                    });
                };
            });
        } // selectUsuarioCompleto
        
    }//Cliente
    
    if(instance === null) instance = new Cliente();
    module.exports = Cliente;
    Cliente.Cliente = instance;
}());