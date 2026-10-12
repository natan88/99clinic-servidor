;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        validacao = require("./empresa-validacao"),
        async = require('async'),
        crypto = require('crypto'),
        EnviaEmail = require("src/controller/enviaEmail.js").EnviaEmail,
        utilLib = require("src/controller/util.js").Util,
        _ = require("underscore"),
        evento = require('src/eventos/eventosInternos'),
        fs = require('fs'),
        log = require('src/util/logInterno'),
        uuid = require('uuid'),
        storage = require('src/lib/storage/googleStorage');

    let instance = null;

    function Empresa() {
        const self = this;

        self.cadastra = cadastra;
        self.ativaCadastro = ativaCadastro;
        self.solicitaLinkAtivacao = solicitaLinkAtivacao;
        self.getEmpresa = getEmpresa;
        self.edit = edit;
        self.dashboard = dashboard;
        self.alteraLogo = alteraLogo;
        self.removeLogo = removeLogo;

        function cadastra(dadosEmpresa) {
            if(_.has(dadosEmpresa, 'fone')) {
                dadosEmpresa.fone = dadosEmpresa.fone.replace(/\D/g,'');// remove a formatação do número
            }
            
            return new Promise( function ( resolve, reject){
                
                let dados;
                const valida = function(callback){
                    validacao.validaAdd(dadosEmpresa).then(function(data){
                        dados = data;
                        callback();
                    }).catch(function(err){
                        callback(err);
                    });
                };
                
                let conexao;
                const Transaction = function(callback){
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno', null);}
                            callback();
                        });
                    });
                };
                
                
                let idEmpresa;
                const cadastraEmpresa = function(callback){   
                    let insert = {
                        nome: dados.empresa,
                        email: dados.email,
                        ativo: 's',
                        // telefone: dados.fone
                    };
                    if( dados.profissionais ) insert.profissionais = dados.profissionais;
                    if( dados.fone ) insert.telefone = dados.fone;
                    if( dados.facebook_id ) {
                        insert.facebook_id = dados.facebook_id;
                        insert.aprovado = 's'; // já está aprovado
                    }
                    conexao.query('INSERT INTO empresa SET ?', [insert], function(err, result){
                        if(err) return callback("Erro interno");
                        idEmpresa = result.insertId;
                        callback();
                    });
                };
                
                const cadastraUser = function(callback){
                        const dadosUser = {
                            empresa_id: idEmpresa,
                            nome: dados.nome,
                            email: dados.email,
                            perfil: 'a',
                            ativo: 's'
                        };

                        if( dados.pass ) {
                            dadosUser.senha = crypto.createHash('md5').update(dados.pass).digest('hex');
                        }
                        if( dados.fone ) dadosUser.fone = dados.fone;
                        if( dados.facebook_id ) dadosUser.facebook_id = dados.facebook_id;

                        // faz o cadastro do usuário
                        conexao.query('INSERT INTO usuario SET ?', [dadosUser], function(err, result){
                            if(err) return callback("Erro interno");
                            callback();
                        });
                };
                
                // processa
                async.series({
                    valida: valida,
                    transaction: Transaction,
                    empresa: cadastraEmpresa,
                    user: cadastraUser
                },
                function(err){
                    if(err) {
                        reject(err);
                        conexao.rollback(function(){conexao.release();});
                    }else {
                        conexao.commit(function(err) {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback(function(){conexao.release();});
                            }else {
                                conexao.release();
                                resolve();
                                
                                if( dados.facebook_id ) { // cadastro via FACEBOOk
                                    utilLib.adicionaDadosDeDemonstracao( idEmpresa );
                                    utilLib.cadastraProfissionalPadrao( idEmpresa );
                                    EnviaEmail.EmpresaAprovado( dados.email, dados.empresa, dados.nome );
                                } else { // cadastro via formulário normal
                                    const tokenID = crypto.createHash('md5').update(idEmpresa.toString()).digest('hex');
                                    EnviaEmail.CadastroEmpresa(dados.email, dados.empresa, dados.nome, tokenID, idEmpresa);
                                }
                            }
                        });
                    }
                });
            });
        }//cadastra
        
        /**
         * Ativa o cadastro da empresa
         * 
         * ERROS
         * 1 = token não localizado
         * 2 = erro interno
         * 3 = token faltando ou inválido
         * resolve 1 para OK ou o nome da empresa caso o cadastro já esteja aprovado
         * 
         * @param {string} token MD5 do id da empresa
         */
        function ativaCadastro(token) {
            return new Promise( function ( resolve, reject){
                if(!token) return reject('Token faltando');
                token = token.toString();
                if(_.isEmpty(token) || !token || token == '') return reject('Token inválido');
                
                mysql.query('SELECT id, aprovado, email, nome FROM empresa WHERE MD5(id) = ?', [token], function(err, result){
                    if(err) return reject('Erro interno');// erro interno
                    if(result.length == 0) return reject('Token não encontrado');
                    let empresa = result[0];
                    if( empresa.aprovado == 's') return resolve( empresa.nome ); // cadastro aprovado anteriormente

                    
                    mysql.query('UPDATE empresa SET aprovado = "s" WHERE id = ?', [ empresa.id ], function(err, re){
                        if(err) return reject('Erro interno');
                        resolve(1);
                        
                        utilLib.adicionaDadosDeDemonstracao( empresa.id );
                        utilLib.cadastraProfissionalPadrao( empresa.id );

                        // busca o nome do usuário para enviar o e-mail
                        mysql.query('SELECT nome FROM usuario WHERE empresa_id = ? ORDER BY id ASC LIMIT 1', [ empresa.id ], (err, res) => {
                            let usuarioNome = '';
                            if( res && res.length > 0 ) {
                                usuarioNome = res[0].nome;
                            }
                            
                            EnviaEmail.EmpresaAprovado( empresa.email, empresa.nome, usuarioNome );
                        });
                    });
                });
            });
        }
        
        /**
         * Solicita e-mail de ativação
         * 
         * @param {string} usuarioIDToken MD5 do ID do usuário.
         */
         function solicitaLinkAtivacao(email, senha, usuarioIDToken, empresaID ) {
            return new Promise( function ( resolve, reject){
                let md5 = crypto.createHash('md5').update(senha).digest('hex');
                let select = `SELECT e.id, e.ativo AS eativa, e.nome AS empresa, e.email FROM usuario u 
                    LEFT JOIN empresa e ON (u.empresa_id = e.id) 
                    WHERE u.email = ? AND u.senha = ? AND MD5(u.id) = ? AND e.id = ? LIMIT 1`;
                
                mysql.query(select, [email, md5, usuarioIDToken, empresaID], function(err, result){
                    if(err) return reject('Erro ao processar a solicitação');
                    if(result.length == 0) return reject('Cadastro não localizado');
                    if(result[0].eativa != 's') return reject('A empresa "' + result[0].empresa + '" não esta ativa, não é possível ativar esse cadastro.');
                    
                    resolve();
                    let tokenID = crypto.createHash('md5').update(result[0].id.toString()).digest('hex');
                    EnviaEmail.LinkAtivacaoEmpresa(result[0].email, result[0].empresa, tokenID);
                });
            });
        }

        
        // retorna os dados da empresa. No futuro os dados retornados pode ser de acordo com o perfil do usuário
        function getEmpresa(empresaID, userID) {
            return new Promise( function ( resolve, reject){
                let select = `SELECT e.id, e.nome, e.cnpj, e.telefone, e.telefone2, e.telefone3, e.email, e.logo, e.uf, e.cidade, e.bairro, 
                    e.endereco, e.complemento, e.cep, e.slogan, e.site 
                    FROM empresa e 
                    LEFT JOIN usuario u ON (u.empresa_id = e.id) 
                    WHERE e.id = ? AND e.ativo = ? AND u.empresa_id LIMIT 1`;
                
                mysql.query(select, [empresaID, 's', userID], function(err, result){
                    if(err || result.length == 0) return reject();
                    resolve(result[0]);
                });
            });
        }//getEmpresa
        
        
        function edit(empresaID, userPerfil, dados) {
            return new Promise( function ( resolve, reject){
                validacao.validaEdit(userPerfil, empresaID, dados).then(function(data){
                    // normaliza os dados
                    if( !data.cnpj ) data.cnpj = null;
                    if( !data.uf ) data.uf = null;
                    if( !data.cidade ) data.cidade = null;
                    if( !data.bairro ) data.bairro = null;
                    if( !data.endereco ) data.endereco = null;
                    if( !data.complemento ) data.complemento = null;
                    if( !data.cep ) data.cep = null;
                    if( !data.slogan ) data.slogan = null;
                    if( !data.site ) data.site = null;
                    if( !data.telefone2 ) data.telefone2 = null;
                    if( !data.telefone3 ) data.telefone3 = null;
                    
                    mysql.query('UPDATE empresa SET ? WHERE id = ?', [data, empresaID], function(err, result){
                        if(err) return reject('Erro interno');
                        resolve();
                        evento.emit( 'empresa.edit', empresaID, data );
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        }//edit
        
        
        /*----------------------------- DASHBOARD ----------------------------*/
        
        /**
         * @param {string} data data no formato 'YYYY-MM-DD'
         */
        function dashboard(empresaID, data) {
            return new Promise( function ( resolve ){
                
                const FormaPg = function(callback) {
                    mysql.query('SELECT pg_forma, count(*) AS total FROM atendimento WHERE pg_forma IS NOT NULL AND empresa_id = ? AND DATE(dt_agenda) = ? GROUP BY pg_forma', [empresaID, data], function(err, result){
                        if(!result) return callback(null, [] );
                        callback(null, result);
                    });
                };
                
                const ValorTotal = function(callback) {
                    mysql.query('SELECT SUM(IFNULL(pg_valor, 0)) AS total FROM atendimento WHERE empresa_id = ? AND DATE(dt_agenda) = ?', [empresaID, data], function(err, result){
                        if(!result) return callback(null, 0 );
                        callback(null, result[0].total || 0 );
                    });
                };
                
                const ValorComissao = function(callback) {
                    mysql.query('SELECT SUM(comissao) AS total FROM v_atendimento WHERE empresa_id = ? AND DATE(dt_agenda) = ? AND status = ?', 
                    [empresaID, data, '5'], function(err, result){
                        if(!result) return callback(null, 0 );
                        callback(null, result[0].total || 0);
                    });
                };
                
                const ERetorno = function(s, callback) {
                    mysql.query('SELECT count(*) AS total FROM atendimento WHERE atendimento_id '+s+' AND empresa_id = ? AND DATE(dt_agenda) = ?', [empresaID, data], function(err, result){
                        if(!result) return callback(null, 0 );
                        callback(null, result[0].total || 0 );
                    });
                };
                
                const EParticular = function(s, callback) {
                    mysql.query('SELECT count(*) AS total FROM atendimento WHERE convenio_id '+s+' AND empresa_id = ? AND DATE(dt_agenda) = ?', [empresaID, data], function(err, result){
                        if(!result) return callback(null, 0 );
                        callback(null, result[0].total || 0 );
                    });
                };
                
                const Servicos = function(callback) {
                    let select = `SELECT a.procedimento AS srv, COUNT(*) AS total FROM atendimento a 
                    WHERE a.empresa_id = ? AND DATE(a.dt_agenda) = DATE(?) GROUP BY a.procedimento`;
                    
                    mysql.query(select, [empresaID, data], function(err, result){
                        callback(null, result);
                    });
                };
                
                const Status = function(callback) {
                    let select = 'SELECT a.status, COUNT(*) AS total FROM v_atendimento a WHERE a.empresa_id = ? AND DATE(a.dt_agenda) = ? GROUP BY a.status';
                    mysql.query(select, [empresaID, data], function(err, result){
                        return callback(null,  result);
                    });
                };

                async.parallel({
                    status: function(callback){Status(callback); },
                    pagamento: function(callback){FormaPg(callback); },
                    
                    valorTotal: function(callback){ValorTotal(callback); },
                    valorComissao: function(callback){ValorComissao(callback); },
                    retorno: function(callback){ERetorno('IS NOT NULL', callback); },
                    consulta: function(callback){ERetorno('IS NULL', callback); },
                    convenio: function(callback){EParticular('IS NOT NULL', callback); },
                    particular: function(callback){EParticular('IS NULL', callback); },
                    servicos: function(callback){Servicos(callback); }
                }, function(err, result){
                    resolve(result);
                });
            });
        }//dashboard


        /**
         * Envia uma nova logo da empresa. Se a empresa já tiver uma logo, 
         * bustitui a antiga pela nova
         * 
         * REQUISITOS
         * - só administrador pode enviar
         * - deve ser assinante do plano pró e está com o mesmo ativo
         * 
         * @param {string} novaLogo nome do arquivo no disco
         */
        function alteraLogo ( empresaID, user, novaLogo ) {
            return new Promise ( ( resolve, reject ) => {
                if( user.perfil != 'a' && user.id != userID ) {
                    return reject('sem permisão. É necessário ser administrador');
                }

                let imagemAntiga,
                nomeNovaImagem,// nome salvo no storage
                pastaDestino = storage.getPastaEmpresa( empresaID );

                const getEmpresa = ( callback ) => {
                    mysql.query('SELECT logo FROM empresa WHERE id = ?', [ empresaID ], (err, result) => {
                        if ( err || !result ) return callback('Erro interno');
                        if( result.length == 0 ) return callback('Cadastro não localizado!');
                        imagemAntiga = result[0].logo;
                        callback();
                    });
                };

                const enviaArquivoStorage = ( callback ) => {
                    let nomeArquivoDestino = 'logo-' + uuid();
            
                    storage.salvaArquivoDoDisco( novaLogo, pastaDestino, nomeArquivoDestino )
                    .then( nomeArquivoFinal => {
                        nomeNovaImagem = nomeArquivoFinal;
                        callback();
                        fs.unlink( novaLogo, ()=> {});
                    })
                    .catch( erro => {
                        fs.unlink( novaLogo, ()=> {});
                        callback('Falha ao enviar arquivo: ');
                        let msg = `Falha ao enviar logo da empresa \nCódigo de erro: ${erro.code} \nID da empresa: ${empresaID}`;
                        log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/conta/empresa.js');
                    });
                };

                /**
                 * Se o nome do arquivo não for alterado não precisa atualizar
                 * O nome do arquivo só é alterado se o nome for diferente do
                 * arquivo anterior
                 */
                const atualizaUsuario = ( callback ) => {
                    if( imagemAntiga === nomeNovaImagem ) return callback();

                    mysql.query('UPDATE empresa SET logo = ? WHERE id = ?', [ nomeNovaImagem, empresaID ], ( erro, result ) => {
                        if( erro || !result ) return callback();
                        if( result.affectedRows <= 0 ) {
                            // TODO: remover imagem do servidor GCS
                            return callback('Erro ao enviar imagem');
                        }
                        callback();
                    });
                };

                /**
                 * Remove a imagem antiga serviço de storage se: houver imagem 
                 * antiga e o nome do arquivo for diferente do atual
                 */
                const removeImagemAntiga = ( ) => {
                    if( !imagemAntiga || imagemAntiga === nomeNovaImagem ) return;

                    storage.deletaArquivo( `${pastaDestino}/${imagemAntiga}` )
                    .then( () => {
                        callback();
                    })
                    .catch( erro => {
                        let msg = `Falha ao remover logo antiga da empresa (ao atualizar)
Código de erro: ${erro.code}
Arquivo: ${imagemAntiga}
ID da empresa: ${empresaID}`;
                        log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/conta/empresa.js');
                    });
                };

                async.series([
                    getEmpresa, enviaArquivoStorage, atualizaUsuario
                ], ( erro ) => {
                    if( erro ) return reject( erro );
                    resolve( nomeNovaImagem );
                    removeImagemAntiga();
                    evento.emit('empresa.logoAlterada', empresaID, nomeNovaImagem );
                });
            });
        }

        /**
         * Apaga a logo da empresa
         * 
         * POSSÍVEIS RETORNOS
         * - não há 
         */
        function removeLogo ( empresaID, user ) {
            return new Promise( ( resolve, reject ) => {
                if( user.perfil != 'a' ) return reject('sem permisão. É necessário ser administrador');
                let nomeArquivo;

                const getNomeArquivo = ( callback ) => {
                    mysql.query('SELECT logo FROM empresa WHERE id = ?', [ empresaID ], (err, result) => {
                        if ( err || !result ) return callback('Erro interno');
                        if( result.length == 0 ) return callback('Empresa não localizada!');
                        if( !result[0].logo ) return callback('Não há logo para ser excluída');
                        nomeArquivo = result[0].logo;
                        callback();
                    });
                };

                const deletaArquivo = ( callback ) => {
                    if( !nomeArquivo ) return callback('Arquivo não localizado');
                    let pastaDestino = storage.getPastaEmpresa( empresaID );

                    storage.deletaArquivo( `${pastaDestino}/${nomeArquivo}` )
                    .then( () => {
                        callback();                        
                    })
                    .catch( erro => {
                        if( erro.code == 404 ) { // não foi encontrado o arquivo no servidor remoto (storage)
                            return callback(); // não deve lançar um erro, já que precisa remover a entrada no BD
                        }
                        callback( 'Falha ao remover arquivo' );
                    });
                };

                const atualizaBancoDeDados = ( callback ) => {
                    mysql.query('UPDATE empresa SET logo = ? WHERE id = ?', [ null, empresaID ], ( erro, result ) => {
                        if( erro || !result ) return callback('Falha ao remover logomarca');// a imagem foi pagada no passo anterior, mas ainda consta no banco de dados
                        // if( result.affectedRows <= 0 ) return callback('Nenhum dado alterado');
                        callback();
                    });
                };

                async.series([
                    getNomeArquivo,
                    deletaArquivo,
                    atualizaBancoDeDados
                ], 
                ( erro ) => {
                    if( erro ) return reject( erro );
                    resolve();
                    evento.emit( 'empresa.logoRemovida', empresaID );
                });                
            });
        }
    }
    
    if(instance === null) instance = new Empresa();
    module.exports = Empresa;
    Empresa.Empresa = instance;
}());