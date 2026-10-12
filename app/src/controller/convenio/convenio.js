;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        validacao = require("./convenio-validacao"),
        evento = require('src/eventos/eventosInternos');

    let instance = null;

    function Convenio() {
        const self = this;
        
        
        // Retorna todos os convênios
        self.getAll = function(empresaId) {
            return new Promise( function ( resolve, reject){
                mysql.query('SELECT id, nome, ativo FROM convenio WHERE empresa_id = ?', [empresaId], function(err, result){
                    if(err || result.length == 0) return reject();
                    resolve(result);
                });
            });
        };//getAll
        
        self.add = function(empresaID, userID, userPerfil, dados) {
            return new Promise( function ( resolve, reject){
                validacao.valida(empresaID, userID, userPerfil, dados).then(function(data){
                    let dadosAdd = {
                        empresa_id: parseInt(empresaID),
                        nome: data.nome,
                        ativo: data.ativo
                    };
                    mysql.query('INSERT INTO convenio SET ?', [dadosAdd], function(err, result){
                        if(err || result.length == 0) return reject('Erro interno');
                        resolve(result.insertId);
                        dadosAdd.id = result.insertId;
                        delete dadosAdd.empresa_id; // não precisa desse dados na notificação
                        evento.emit( 'convenio.add', empresaID, dadosAdd );
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        };//add

        self.edit = function(empresaID, userID, userPerfil, dados) {
            return new Promise( function ( resolve, reject){
                validacao.valida(empresaID, userID, userPerfil, dados).then(function(data){
                    let dadosEdit = {
                        nome: data.nome,
                        ativo: data.ativo
                    };
                    mysql.query('UPDATE convenio SET ? WHERE id = ? AND empresa_id = ?', [dadosEdit, data.id, empresaID], function(err, result){
                        if(err || result.length == 0) return reject('Erro interno');
                        resolve();
                        evento.emit( 'convenio.edit', empresaID, data.id, dadosEdit );
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        };//edit
    }
    
    if(instance === null) instance = new Convenio();
    module.exports = Convenio;
    Convenio.Convenio = instance;
}());