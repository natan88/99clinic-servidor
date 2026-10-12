;(function () {
    "use strict";
    

    const 
        mysql = require('src/util/conexoes.js'),
        validacao = require("./usuario-validacao.js"),
        EnviaEmail = require("src/controller/enviaEmail.js").EnviaEmail,
        async = require('async'),
        crypto = require('crypto'),
        uuid = require('uuid'),
        _ = require('underscore'),
        evento = require('src/eventos/eventosInternos'),
        geraCodigo = require('src/util/util').codigoUnico,
        fs = require('fs'),
        log = require('src/util/logInterno'),
        storage = require('src/lib/storage/googleStorage');

    let instance = null;

    function Usuario() {
        const self = this;

        self.getMe = getMe;
        self.meEdit = meEdit;
        self.meEditSenha = meEditSenha;
        self.getUsers = getUsers;
        self.addUser = addUser;
        self.editUser = editUser;
        self.editSenhaUser = editSenhaUser;
        self.solicitacaoSobreSenhaUsuario = solicitacaoSobreSenhaUsuario;
        self.delUser = delUser;
        self.recuperaSenha = recuperaSenha;
        self.redefineSenha = redefineSenha;
        self.alteraImagemPerfil = alteraImagemPerfil;
        self.removeImagemPerfil = removeImagemPerfil;
        
        // retorna os dados da empresa. No futuro os dados retornados pode ser de acordo com o perfil do usuário
        function getMe(empresaID, userID) {
            return new Promise( function ( resolve, reject){
                const select = `SELECT u.id, u.perfil, u.foto, u.email, u.fone, u.celular, u.nome, p.id AS profissional_id, ga.id AS google_agenda
                    FROM usuario u 
                    LEFT JOIN empresa e ON (u.empresa_id = e.id) 
                    LEFT JOIN profissional p ON (u.id = p.usuario_id) 
                    LEFT JOIN google_agenda AS ga ON (ga.profissional_id = p.id AND ga.ativo = 's')
                    WHERE u.id = ? AND u.ativo = "s" AND u.empresa_id = ? AND e.ativo = "s" LIMIT 1`;
                
                mysql.query(select, [userID, empresaID], function(err, result){
                    if(err || result.length == 0) return reject();
                    // if( result[0].perfil == 'p') { // buscar profissional
                    // }
                    result[0].google_agenda = result[0].google_agenda ? true : false;
                    resolve(result[0]);
                });
            });
        }//getMe
        
        /*
         * O usuário logado atualiza seus dados
         */
        function meEdit(empresaID, user, dados) {
            return new Promise( function ( resolve, reject) {
                validacao.validaMe(empresaID, user, dados).then(function(data){
                    mysql.query('UPDATE usuario SET ? WHERE id = ? AND empresa_id = ?', [data.dados, user.id, empresaID], function(err, result){
                        if(err || result.length == 0) return reject('Erro interno');
                        resolve();

                        // emite evento usuário atualizado
                        let _dados = Object.assign( {perfil: user.perfil, ativo: data.dadosAntigos.ativo}, data.dados );
                        evento.emit('usuario.edit', empresaID, user.id, _dados);

                        // envia e-mail
                        let perfil = getNomePerfil( data.dadosAntigos.perfil );
                        let emailAlterado = data.dadosAntigos.email != data.dados.email;
                        EnviaEmail.usuarioDadosAlterados( data.dados.email, data.dados.nome, perfil, data.dadosAntigos.empresaNome, 'você', emailAlterado );
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        }//meEdit
        
        function meEditSenha(empresaID, userID, senhas) {
            return new Promise( function ( resolve, reject) {

                const enviaEmail = () => {
                    mysql.query(`SELECT u.email, u.nome, u.perfil, e.nome AS empresaNome
                    FROM usuario u
                    LEFT JOIN empresa e ON (e.id = u.empresa_id)
                    WHERE u.id = ? AND u.empresa_id = ?`, [userID, empresaID], (erro, result ) => {
                        if( erro || !result ) return;
                        if( result.length === 0 ) return;

                        // envia e-mail ao usuário alterado
                        const usuario = result[0];
                        let perfil = getNomePerfil( usuario.perfil );
                        EnviaEmail.usuarioSenhaAlterada(usuario.email, usuario.nome, perfil, usuario.empresaNome);
                    });
                };

                validacao.validaMeSenha(empresaID, userID, senhas).then(function(data){
                    const senha = crypto.createHash('md5').update(data.senha).digest('hex');
                    
                    mysql.query('UPDATE usuario SET senha = ? WHERE id = ? AND empresa_id = ?', [senha, userID, empresaID], function(err, result){
                        if(err || result.length == 0) return reject('Erro interno');
                        resolve();
                        enviaEmail();
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        }//meEditSenha
        
        /*
         * Retorna todos os usuários dos sistema
         *
         * Da forma que foi feito o widget que exibe a imgem de perfil usuário, é necessário
         * ter todos os usuários no app
         */
        function getUsers(empresaID) {
            return new Promise( function ( resolve){
                mysql.query(`SELECT u.id, u.perfil, u.foto, u.email, u.fone, u.celular, u.nome, u.ativo, p.id AS profissional_id 
                FROM usuario u
                LEFT JOIN profissional p ON (p.usuario_id = u.id)
                WHERE u.empresa_id = ? 
                ORDER BY u.perfil = 'a' DESC, u.perfil = 's' DESC, u.nome ASC`, [empresaID], 
                (err, result)=> {
                    if(err) return reject();
                    resolve(result);
                });
            });
        }//getUsers
        
        /*
         * Adiciona um novo usuário
         * Somente administrador
         */
        function addUser(empresaID, user, dados) {
            return new Promise( function ( resolve, reject){
                validacao.validaUsuario(empresaID, user.perfil, dados).then(function(data){

                    let insert = Object.assign( {}, data.dados );
                    insert.empresa_id = empresaID;

                    if(!_.has(insert, 'fone') || !insert.fone)    insert.fone = null;
                    if(!_.has(insert, 'celular') || !insert.celular) insert.celular = null;

                    let senha =  geraCodigo(8);
                    let senhaMD5 = crypto.createHash('md5').update(senha).digest('hex');
                    let token = uuid.v1();

                    let senhaEmail;
                    if( insert.senha == 'gerar') {
                        insert.senha = senhaMD5;
                        senhaEmail = senha;
                    } else {
                        insert.senha = null;
                        insert.token_rs = token;
                        insert.dt_token_rs = new Date();
                    }
                    
                    mysql.query('INSERT INTO usuario SET ?', [insert], function(err, result){
                        if(err || result.length == 0) return reject('Erro interno');
                        resolve(result.insertId);
                        insert.id = result.insertId;

                        insert = _.omit(insert, ['empresa_id', 'senha', 'token_rs', 'dt_token_rs']);
                        evento.emit('usuario.add', empresaID, insert);

                        // envia e-mail ao usuário recém cadastrado
                        let tokenID = crypto.createHash('md5').update( insert.id.toString()).digest('hex');
                        let perfil = getNomePerfil( insert.perfil );

                        EnviaEmail.usuarioCadastrado( insert.email, insert.nome, perfil, data.dadosAntigos.empresaNome, token, tokenID, senhaEmail );
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        }//addUser
        
        /*
         * Atualiza um novo usuário
         * Somente administrador
         */
        function editUser(empresaID, user, dados) {
            dados = _.omit(dados, 'foto');// retira a FOTO
            return new Promise( function ( resolve, reject) {
                validacao.validaUsuario(empresaID, user.perfil, dados).then(function(data){

                    if(!_.has(data.dados, 'id')) return reject('Este usuário parece não existir');
                    if(_.has(data.dados, 'senha')) data.dados.senha = crypto.createHash('md5').update(data.dados.senha).digest('hex');
                    
                    if(!_.has(data.dados, 'fone') || !data.dados.fone)    data.dados.fone = null;
                    if(!_.has(data.dados, 'celular') || !data.dados.celular) data.dados.celular = null;
                    
                    const idEdit = data.dados.id;
                    dados = _.omit(data.dados, 'id');// retira o ID

                    mysql.query('UPDATE usuario SET ? WHERE id = ? AND empresa_id = ?', [dados, idEdit, empresaID], function(err, result){
                        if(err || result.length == 0) return reject('Erro interno');
                        resolve();
                        dados = _.omit(data.dados, ['senha']);
                        evento.emit('usuario.edit', empresaID, idEdit, dados);

                        // envia e-mail
                        let perfil = getNomePerfil( data.dados.perfil );
                        let emailAlterado = data.dadosAntigos.email != data.dados.email;
                        EnviaEmail.usuarioDadosAlterados( data.dados.email, data.dados.nome, perfil, data.dadosAntigos.empresaNome, 'um administrador', emailAlterado );
                    });
                }).catch(function(erro){
                    return reject(erro);
                });
            });
        }//editUser
        
        // não esta em uso
        function editSenhaUser(empresaID, userPerfil, userIDEdit, senha) {
            return new Promise( function ( resolve, reject) {
                if(userPerfil != 'a') return reject('sem permissão');
                if(!_.isString(senha)) return reject('Senha inválida');
                if(senha.length < 4 || senha.length > 12) return reject('A senha deve ter entre 4 e 12 caracteres');
                
                senha = crypto.createHash('md5').update(senha).digest('hex');
                mysql.query('UPDATE usuario SET senha=? WHERE id = ? AND empresa_id = ?', [senha, userIDEdit, empresaID], function(err, result){
                    if(err || result.length == 0) return reject('Erro interno');
                    resolve();
                });
            });
        }//editSenhaUser
        
        /**
         * Realiza 1 das 3 opções relativos a senha do usuário
         * 
         * AÇÕES
         * - Gerar nova senha e enviar para ao e-mail do usuário
         * - Enviar link para o usuário gerar uma nova senha
         * 
         * @param {int} empresaID PK da empresa
         * @param {Object} user usuário que esta realizando a ação
         * @param {int} userID PK do usuário que esta sendo processado
         * @param {string} acao ação pretendida. 
         *                      'gerar' = gerar nova senha aleatória e enviar ao e-mail
         *                      'link' = enviar link para o usuário redefinir sua senha
         */
        function solicitacaoSobreSenhaUsuario(empresaID, user, userID, acao) {
            return new Promise( function ( resolve, reject) {
                if( user.perfil != 'a') return reject('Você não tem permissão');
                const acoes = ['gerar', 'link'];
                
                let usuario, 
                novaSenha,
                token = uuid.v1(),
                tokenID;

                const valida = ( callback ) => {
                    if( !acoes.includes( acao ) ) return callback({acao: 'opção inválida' });

                    mysql.query(`SELECT u.nome, u.perfil, u.email, e.nome AS empresaNome 
                    FROM usuario u
                    LEFT JOIN empresa e ON (e.id = u.empresa_id)
                    WHERE u.empresa_id = ? AND u.id = ? LIMIT 1`, [ empresaID, userID], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno');
                        if( result.length == 0 ) return callback('Esse usuário parece não existir');
                        usuario = result[0];
                        if( !usuario.email ) return callback('Usuário sem e-mail');
                        callback();
                    });
                };

                const alteraDados = ( callback ) => {
                    tokenID = crypto.createHash('md5').update( userID.toString()).digest('hex');
                    novaSenha = geraCodigo(8);
                    let novaSenhaMD5 = crypto.createHash('md5').update(novaSenha).digest('hex');

                    let query = 'UPDATE usuario SET ';
                    let queryDados = [ ];

                    if( acao == 'gerar') {
                        query += `senha = ?`;
                        queryDados.push(novaSenhaMD5);
                    } else {
                        query += `token_rs = ?, dt_token_rs = NOW()`;
                        queryDados.push(token);
                    }

                    query += ' WHERE id = ? AND empresa_id = ?';
                    queryDados.push( userID, empresaID);

                    mysql.query( query, queryDados, (erro, result) => {
                        if(erro || result.length == 0) return callback('Erro interno');
                        if( result.affectedRows == 0 ) return reject('Erro ao atualizar dados');
                        callback();
                    });
                };

                const enviaEmail = ( callback ) => {
                    let perfil = getNomePerfil( usuario.perfil );

                    if( acao == 'gerar') {
                        EnviaEmail.usuarioSenhaAlteradaPorAdmin(usuario.email, usuario.nome, perfil, usuario.empresaNome, novaSenha);
                    }else {
                        EnviaEmail.LinkRedefinirSenha(usuario.email, usuario.nome, perfil, usuario.empresaNome, token, tokenID);
                    }
                    callback();
                };
                
                
                async.series([valida, alteraDados, enviaEmail],
                ( erro ) => {
                    if( erro ) return reject( erro );
                    resolve();
                });
            });
        }//editSenhaUser
        
        /*
         * Remove um usuário
         * Somente administrador
         * O administrador não pode remover a si mesmo
         * Não pode remover usuários com perfil profissional (p), pois é ao remover
         * o profissional que o usuário é removido
         */
        function delUser(empresaID, userID, perfil, meuID) {
            return new Promise( ( resolve, reject) => {
                if(perfil != 'a') return reject('Você não tem permissão para excluir usuários');
                if(userID == meuID) return reject('Você não pode excluir a si mesmo');
                let imagemUsuario;
                async.series({
                    // verifica se o usuário é profissional, se for não pode excluir
                    eProfissional: (callback)=> {
                        mysql.query('SELECT perfil, foto FROM usuario WHERE id = ? AND empresa_id = ? LIMIT 1', [userID, empresaID], (err, result) => {
                            if( err ) return callback('Erro interno');
                            if( !result || result.length != 1 ) return callback('usuário não localizado');
                            if( result[0].perfil == 'p' ) return callback('Para excluir um profissional, acesse o menu profissionais');
                            imagemUsuario = result[0].foto;
                            callback();
                        });
                    },
                    excluiUsuario: (callback)=> {
                        mysql.query('DELETE FROM usuario WHERE id = ? AND empresa_id = ?', [userID, empresaID], (err, result) => {
                            if( err ) {
                                if( err.code == 'ER_ROW_IS_REFERENCED_2') return callback('Esse usuário realizou alteração nos atendimentos');
                                return callback('Erro interno');
                            }
                            callback();
                        });
                    },
                    excluiFotoUsuario: ( callback ) => {
                        callback();// não há necessidade de aguardar a remoção da imagem, se falhar não deve ser tratado aqui
                        if( !imagemUsuario || _.isEmpty(imagemUsuario) ) return;
                        let pasta= storage.getPastaUsuario( empresaID, userID );

                        storage.deletaArquivo( `${pasta}/${imagemUsuario}` )
                        .then( () => {
                        })
                        .catch( erro => {
                            let msg = `Falha ao remover imagem do perfil do usuário (ao remover usuario)
    
    Código de erro: ${erro.code}
    Arquivo: ${imagemUsuario}
    ID da empresa: ${empresaID}
    ID do usuário: ${userID}`;
                            log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/conta/usuario.js');
                        });
                    }
                },
                (err, result)=> {
                    if(err) return reject(err);
                    resolve();
                    evento.emit('usuario.del', empresaID, userID);
                });
            });
        }//delUser
        
        /*
         * Recupera senha do usuário
         * Envia um link de recuperação para o e-mail do cliente
         */
        function recuperaSenha( dados ) {
            return new Promise( function ( resolve, reject){
                
                validacao.validaRecuperaSenha( dados ).then( data => {
                    mysql.query(`SELECT u.email, u.id, u.nome, u.ativo, e.ativo AS eativo, e.nome AS empresa 
                            FROM usuario u 
                            LEFT JOIN empresa e ON(e.id = u.empresa_id)
                            WHERE u.email = ? AND u.empresa_id = ? AND MD5(u.id) = ? LIMIT 1`, 
                        [ data.email, data.empresaID, data.usuarioID ], function(err, result){
                        if(err) return reject('Erro interno');
                        if(result.length == 0) return reject('Usuário não localizado');
                        
                        if(result[0].ativo != 's') return reject("Usuário inativo. Entre em contato com o adminstrador da empresa '" + result[0].empresa + "'");
                        if(result[0].eativo != 's') return reject("A empresa '" + result[0].empresa + "' não está ativa.");                    
                        resolve();
                        
    
                        const token = uuid.v1();
                        const tokenID = crypto.createHash('md5').update(result[0].id.toString()).digest('hex');
                        EnviaEmail.EnviaEmailRecuperacaoSenha(token, tokenID, result[0].email, result[0].nome);
                        
                        mysql.query('UPDATE usuario SET token_rs= ?, dt_token_rs = NOW() WHERE id = ?', [token, result[0].id]);
                    });
                }).catch( erro => reject( erro ) );
            });
        }//recuperaSenha
        
        /*
         * O usuário recebe o link de recuperação, clica no link e submete o 
         * formulário para cá com a nova senha
         */
        function redefineSenha(token, tokenID, senha, senha2) {
            return new Promise( function ( resolve, reject){
                const Validacao = function(callback) {
                    validacao.validaRedefinirSenha({token: token, tokenID: tokenID, senha: senha, senha2: senha2}).then((data) =>{
                        callback();
                    }).catch(function(erro){callback(erro);});
                };
                
                let usuario;
                const ChecaToken = (callback) => {
                    mysql.query(`SELECT u.id, u.empresa_id, u.email, u.nome, u.perfil, e.nome AS empresaNome
                    FROM usuario u
                    LEFT JOIN empresa e ON (e.id = u.empresa_id)
                    WHERE u.token_rs = ? AND MD5(u.id) = ? AND DATE_SUB(NOW(), INTERVAL 12 HOUR) < u.dt_token_rs`, [token, tokenID], (err, result) =>{
                        if(err) return callback('Erro interno');
                        if(result.length == 0) return callback('Link inválido. O link expira em 12 horas.');
                        usuario = result[0];
                        callback();
                    });
                };
                
                const AlteraSenha = (callback) => {
                    senha = crypto.createHash('md5').update(senha).digest('hex');
                    mysql.query('UPDATE usuario SET senha = ?, token = null, token_rs = NULL, dt_token_rs = NULL WHERE id = ?', [senha, usuario.id], (err, result) =>{
                        if(err || result.length == 0) return callback('Erro interno');
                        callback();
                    });
                };
                
                async.series([Validacao, ChecaToken, AlteraSenha], 
                (err) =>{
                    if(err) return reject(err);
                    resolve();

                    // envia e-mail
                    let perfil = getNomePerfil( usuario.perfil );
                    EnviaEmail.usuarioSenhaAlterada(usuario.email, usuario.nome, perfil, usuario.empresaNome);
                });
            });
        }//redefineSenha

        function getNomePerfil( perfil ) {
            let p = 'usuário';
            switch (perfil) {
                case 'a':
                    p = 'administrador';
                    break;
                case 's':
                    p = 'secretária(o)';
                    break;
                case 'p':
                    p = 'profissional';
                    break;
            }
            return p;
        }

        /**
         * Envia uma nova imagem de perfil de um usuário. Se o usuário já tiver
         * imagem, substitui por uma nova
         * 
         * PERMISSÃO
         * - O usuário SÓ pode enviar sua própria imagem
         * - o administrador pode enviar imagem de qualquer usuário
         * 
         * @param {Object} user usuário que está fazendo a alterção
         * @param {Integer} userID PK do usuário que terá a imagem alterada
         * @param {String} imagemNome nome do arquivo no disco
         */
        function alteraImagemPerfil ( empresaID, user, userID, imagemNome ) {
            return new Promise ( ( resolve, reject ) => {
                if( user.perfil != 'a' && user.id != userID ) {
                    return reject('sem permisão. É necessário ser administrador');
                }

                let imagemAntiga,
                nomeNovaImagem,// nome salvo no storage
                pastaDestino = storage.getPastaUsuario( empresaID, userID );

                const getUsuario = ( callback ) => {
                    mysql.query('SELECT foto FROM usuario WHERE id = ? AND empresa_id = ?', [ userID, empresaID ], (err, result) => {
                        if ( err || !result ) return callback('Erro interno');
                        if( result.length == 0 ) return callback('Usuário não localizado!');
                        imagemAntiga = result[0].foto;
                        callback();
                    });
                };

                const enviaArquivoStorage = ( callback ) => {
                    let nomeArquivoDestino = 'perfil';
            
                    storage.salvaArquivoDoDisco( imagemNome, pastaDestino, nomeArquivoDestino )
                    .then( nomeArquivoFinal => {
                        nomeNovaImagem = nomeArquivoFinal;
                        callback();
                        fs.unlink( imagemNome, ()=> {});
                    })
                    .catch( erro => {
                        fs.unlink( imagemNome, ()=> {});
                        callback('Falha ao enviar arquivo: ');
                        let msg = `Falha ao enviar imagem do perfil do usuário

Código de erro: ${erro.code}
ID da empresa: ${empresaID}
ID do usuário: ${userID}`;
                        log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/conta/usuario.js');
                    });
                };

                /**
                 * Se o nome do arquivo não for alterado não precisa atualizar
                 * O nome do arquivo só é alterado se o nome for diferente do
                 * arquivo anterior
                 */
                const atualizaUsuario = ( callback ) => {
                    if( imagemAntiga === nomeNovaImagem ) return callback();

                    mysql.query('UPDATE usuario SET foto = ? WHERE id = ? AND empresa_id = ?', [ nomeNovaImagem, userID, empresaID ], ( erro, result ) => {
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
                 * atiga e o nome do arquivo for diferente do atual
                 */
                const removeImagemAntiga = ( ) => {
                    if( !imagemAntiga || imagemAntiga === nomeNovaImagem ) return;

                    storage.deletaArquivo( `${pastaDestino}/${imagemAntiga}` )
                    .then( () => {
                        callback();
                    })
                    .catch( erro => {
                        let msg = `Falha ao remover imagem do perfil do usuário (ao atualizar nova imagem)

Código de erro: ${erro.code}
Arquivo: ${imagemAntiga}
ID da empresa: ${empresaID}
ID do usuário: ${userID}`;
                        log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/conta/usuario.js');
                    });
                };

                async.series([
                    getUsuario, enviaArquivoStorage, atualizaUsuario
                ], ( erro ) => {
                    if( erro ) return reject( erro );
                    resolve( nomeNovaImagem );
                    removeImagemAntiga();
                    evento.emit('usuario.imagemAlterada', empresaID, userID, nomeNovaImagem );
                });
            });
        }

        /**
         * Apaga a imagem do perfil de um usuário
         * PERMISSÕES
         * - O usuário SÓ pode apagar sua própria imagem
         * - o administrador pode apagar imagem de qualquer usuário
         */
        function removeImagemPerfil ( empresaID, user, userRemoverID ) {
            return new Promise( ( resolve, reject ) => {

                /**
                 * Para remover
                 */
                if( user.perfil != 'a' && user.id != userRemoverID ) {
                    return reject('sem permisão. É necessário ser administrador');
                }
                let nomeArquivo;

                const getNomeArquivo = ( callback ) => {
                    mysql.query('SELECT foto FROM usuario WHERE id = ? AND empresa_id = ?', [ userRemoverID, empresaID ], (err, result) => {
                        if ( err || !result ) return callback('Erro interno');
                        if( result.length == 0 ) return callback('Usuário não localizado!');
                        if( !result[0].foto ) return callback('Não há imagem para ser excluída');
                        nomeArquivo = result[0].foto;
                        callback();
                    });
                };

                const deletaArquivo = ( callback ) => {
                    if( !nomeArquivo ) return callback('Arquivo não localizado');
                    let pastaDestino = storage.getPastaUsuario( empresaID, userRemoverID );

                    storage.deletaArquivo( `${pastaDestino}/${nomeArquivo}` )
                    .then( () => {
                        callback();                        
                    })
                    .catch( erro => {
                        if( erro.code == 404 ) {
                            // Não há arquivo para ser excluído
                            return callback();
                        }
                        callback( 'Falha ao remover arquivo' );

                        let msgLog = `Falha ao remover imagem do perfil do usuário
Código de erro: ${erro.code}
Arquivo: ${pastaDestino}/${nomeArquivo}
ID da empresa: ${empresaID}
ID do usuário: ${userRemoverID}`;
                        log.registraErro( msgLog, 'arquivo,storage', 'Arquivo: src/controller/conta/usuario.js');
                    });
                };

                const atualizaBancoDeDados = ( callback ) => {
                    mysql.query('UPDATE usuario SET foto = ? WHERE id = ? AND empresa_id = ?', [ null, userRemoverID, empresaID ], ( erro, result ) => {
                        if( erro || !result ) return callback('Falha ao remover imagem');// a imagem foi pagada no passo anterior, mas ainda consta no banco de dados
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
                    evento.emit( 'usuario.imagemRemovida', empresaID, userRemoverID );
                });                
            });
        } // removeImagemPerfil
    }
    
    // util.inherits(Usuario, EventEmitter);
    if(instance === null) instance = new Usuario();
    module.exports = Usuario;
    Usuario.Usuario = instance;
}());