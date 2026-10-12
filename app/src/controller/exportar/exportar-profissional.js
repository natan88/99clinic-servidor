;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        async = require('async'),
        _ = require('underscore');
    
    let instance = null;
   
    function ExportarProfissional() {
        const self = this;
     
        self.exportar = ( empresaID ) => {
            return new Promise( ( resolve ) => {
                let sqlS = `SELECT ps.servico_id AS id, ps.valor, s.nome FROM profissional_has_servico ps 
                    LEFT JOIN servico s ON (s.id = ps.servico_id )
                    WHERE ps.profissional_id = ?`;
                
                let sqlC = `SELECT pc.convenio_id AS id, c.nome FROM profissional_has_convenio pc
                    LEFT JOIN convenio c ON (c.id = pc.convenio_id )
                    WHERE pc.profissional_id = ?`;


                let select = `id, dt_cadastro, nome, COALESCE(sexo, '') AS sexo, COALESCE(nascimento, '') AS nascimento, COALESCE(nota, '') AS nota, 
                COALESCE(uf, '') AS uf, COALESCE(cidade, '') AS cidade, COALESCE(bairro, '') AS bairro, COALESCE(endereco, '') AS endereco, 
                COALESCE(cep, '') AS cep, COALESCE(email, '') AS email, COALESCE(celular, '') AS celular, COALESCE(telefone, '') AS telefone, 
                COALESCE(cpf, '') AS cpf, COALESCE(conselho, '') AS conselho, COALESCE(conselho_uf, '') AS conselho_uf, 
                COALESCE(conselho_nr, '') AS conselho_nr, COALESCE(tratamento, '') AS tratamento, COALESCE(especialidade, '') AS especialidade, 
                COALESCE(horario, '') AS horario, ativo`;
                let retorno = [];


                mysql.query(`SELECT ${select} FROM profissional WHERE empresa_id = ? AND demo !='s'`, [ empresaID ], (err, result) => {
                    if(err || !result) return resolve([]);
                    if(result.length === 0) return resolve([]);

                    async.each(result, (user, callback) => {
                        user.horario = JSON.parse(user.horario);
                        async.parallel({
                            servico: (callback) => {
                                mysql.query(sqlS, [user.id], (err, result) => {
                                    if(err || result.length < 1) return callback(err, null);
                                    return callback(null, result);
                                });
                            },
                            convenio: (callback) => {
                                mysql.query(sqlC, [user.id], (err, result) => {
                                    if(err || result.length < 1) return callback(err, null);
                                    return callback(null, result);
                                });
                            }
                        }, (err, result) => {
                            user.servico = [];
                            user.convenio = [];
                            if(result.servico) user.servico = result.servico;
                            if(result.convenio) user.convenio = result.convenio;
                            retorno.push(user);
                            callback();
                        });
                    }, () => {
                        resolve(retorno);
                    });
                });
            });
        };//profissionais
        /*-------------------------- fim PROFISSIONAL ------------------------*/       
    }
    
    if(instance === null) instance = new ExportarProfissional();
    module.exports = ExportarProfissional;
    ExportarProfissional.Exportar = instance;
}());