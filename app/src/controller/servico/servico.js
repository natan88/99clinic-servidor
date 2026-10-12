;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        validacao = require("./servico-validacao"),
        _ = require('underscore'),
        evento = require('src/eventos/eventosInternos');

    let instance = null;
    
    function Servico() {
        const self = this;
        
        /*
         * Retorna os usuários dos sistema
         * Para todos os usuários, 
         */
        self.getAll = function(empresaID) {
            return new Promise( function ( resolve){
                mysql.query('SELECT id, nome, descricao, valor, tempo, prazo_retorno, ativo, demo FROM servico WHERE empresa_id = ?', [empresaID], function(err, result){
                    if ( err || !result ) return reject();
                    resolve(result);
                });
            });
        };//getAll
        
        /*
         * Adiciona um novo serviço
         * Somente administrador
         */
        self.add = function(empresaID, userID, userPerfil, dados) {
            return new Promise( function ( resolve, reject){
                validacao.valida(empresaID, userPerfil, dados).then(function(data){
                    data.empresa_id = empresaID;                    
                    mysql.query('INSERT INTO servico SET ?', [data], function(err, result){
                        if(err || !result || result.length == 0) return reject('Erro interno');
                        resolve(result.insertId);
                        data.id = result.insertId;
                        delete data.empresa_id;
                        evento.emit( 'servico.add', empresaID, data );
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        };//add
        
        /*
         * Atualiza um serviço
         * Somente administrador
         */
        self.edit = function(empresaID, userID, userPerfil, dados) {
            return new Promise( function ( resolve, reject) {
                validacao.valida(empresaID, userPerfil, dados).then(function(data){
                    if(!_.has(data, 'id')) return reject('Este serviço parece não existir');
                    
                    const idEdit = data.id;
                    data = _.omit(data, 'id');// retira o ID
                    
                    mysql.query('UPDATE servico SET ? WHERE id = ? AND empresa_id = ?', [data, idEdit, empresaID], function(err, result){
                        if ( err || !result || result.length == 0) return reject('Erro interno');
                        resolve();
                        evento.emit( 'servico.edit', empresaID, idEdit, data );
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        };//edit
        
        /*
         * Exclui um serviço
         * Somente administrador tem permissão
         */
        self.del = function(empresaID, userID, perfil, servicoID) {
            return new Promise( function ( resolve, reject ){
                if(perfil != 'a') return reject('Você não tem permissão para excluir serviços');

                const RemoveServico = () => {
                    mysql.query('DELETE FROM servico WHERE id = ? AND empresa_id = ?', [servicoID, empresaID], function(err, result){
                        if ( err || !result ) return reject('Erro interno');
                        if ( !result.affectedRows || result.affectedRows < 1 ) return reject('Serviço não pode ser excluído');
                        resolve();
                        evento.emit( 'servico.del', empresaID, servicoID );
                    });
                };

                // 1º verifica se não há atendimento relacionado
                mysql.query(`SELECT count(*) AS total FROM atendimento WHERE empresa_id = ? AND servico_id = ?`, [ empresaID, servicoID ], ( err, result) => {
                    if( err || !result ) return reject('Erro interno');
                    let total = result[0].total;
                    let plural = total === 1 ? '' : 's' ;
                    if( total > 0 ) return reject(`Esse serviço não pode ser excluído. Há ${total} atendimento${plural} relacionado${plural}`);
                    RemoveServico();
                });
            });
        };//del
        
    }
    
    if(instance === null) instance = new Servico();
    module.exports = Servico;
    Servico.Servico = instance;
}());