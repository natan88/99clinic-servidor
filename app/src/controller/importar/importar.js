;(function () {
    "use strict";
    

    const 
        Cliente = require("src/controller/cliente/cliente.js").Cliente,
        async = require('async'),
        _ = require('underscore'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil;
        
    let instance = null;
    
   
    function Importar() {
        let self = this;

        self.pacientes = pacientes;
        
        /*-------------------------- PACIENTES ------------------------*/
        
        function pacientes(empresaID, userID, userPerfil, dados, permiteNomesDuplicados) {
            return new Promise( function ( resolve, reject){
                let inseridos = 0;
                let atualizados = 0;
                let falhas = [];
                if(!_.isArray(dados)) return reject('Dados inválidos');

                const contaAtiva = ( callback ) => {
                    contaBloqueada( empresaID, callback );
                };
                
                const insereDados = ( callback ) => {
                    let i = 0;
                    async.eachSeries(dados, function(item, callback){
                        if(item.id) { // atualizar
                            Cliente.edit(empresaID, userID, userPerfil, item).then(function(id){
                                atualizados++;
                                callback();
                            }).catch(function(err){
                                i = _.indexOf(dados, item);
                                falhas.push({index: i, nome: item.nome || 'sem nome', erro: err});
                                callback();
                            });                        
                        } else { // inserrir
                            Cliente.add(empresaID, userID, userPerfil, item, permiteNomesDuplicados).then(function(id){
                                inseridos++;
                                callback();
                            }).catch(function(err){
                                i = _.indexOf(dados, item);
                                falhas.push({index: i, nome: item.nome || 'sem nome', erro: err});
                                callback();
                            });                        
                        }
                    }, function(err){
                        callback( err );
                    });
                };

                // processa
                async.series(
                    [ contaAtiva, insereDados ], 
                (err) => {
                    if (err) return reject(err);
                    resolve( {inseridos: inseridos, atualizados: atualizados, falhas: falhas} );
                });
            });
        }//pacientes
        /*-------------------------- fim PACIENTES ------------------------*/


    /**
     * Verifica se a conta esta bloqueada por falta de pagamento do plano pró
     */
    function contaBloqueada ( empresaID, callback ) {
        assinaturaUtil.contaBloqueada( empresaID )
        .then( bloqueado => {
            if( bloqueado ) return callback('Conta bloqueada. Entre em contato com o suporte.');
            callback();
        })
        .catch( erro => callback ( erro ) );
    }

    }
    
    if(instance === null) instance = new Importar();
    module.exports = Importar;
    Importar.Importar = instance;
}());