// register.controller.js
const bcrypt = require('bcrypt');
const connection = require('../db/db');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const emailService = require('../services/email.service');
const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const handlebars = require('handlebars');
require('dotenv').config();

const controller = {};

// Función para obtener la IP real del usuario
const getClientIp = (req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
};

// Función para validar la contraseña
const validatePassword = (password) => {
    // Mínimo 6 caracteres, al menos una letra mayúscula y un número
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)[A-Za-z\d\W]{6,}$/;
    return passwordRegex.test(password);
};

// Función para validar el formato del NIT
const validateNIT = (nit) => {
    // Formato de NIT colombiano: números y guiones, entre 8 y 12 dígitos numéricos en total
    const nitRegex = /^[\d-]+$/;
    if (!nitRegex.test(nit)) return false;
    
    // Contar solo los dígitos numéricos
    const digitos = nit.replace(/-/g, '');
    return digitos.length >= 8 && digitos.length <= 12;
};

const registroRoles = process.env.REGISTRO_HABILITAR_SI_NO;
const CODIGO_SEGURIDAD = process.env.CODIGO_SEGURIDAD_REGISTRO;

const s3Client = new S3Client({
    forcePathStyle: false,
    endpoint: `https://${process.env.DO_SPACES_ENDPOINT}`,
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET
    }
});

console.log('[CONTROLADOR] Verificando controller.registerForm...');
controller.registerForm = async (req, res) => {
    try {
        console.log('[CONTROLADOR] Procesando formulario de registro');
        let roles = [];
        if (registroRoles === "SI") {
            console.log('[CONTROLADOR] REGISTRO_ROLES = SÍ, obteniendo todos los roles');
            const [allRoles] = await connection.query('SELECT id, role_name FROM roles');
            roles = allRoles;
        } else if (registroRoles === "NO") {
            console.log('[CONTROLADOR] REGISTRO_ROLES = NO, obteniendo solo rol contratista');
            const [contratistaRole] = await connection.query('SELECT id, role_name FROM roles WHERE role_name = "contratista"');
            roles = contratistaRole;
        }

        if (!roles || roles.length === 0) {
            console.error('[CONTROLADOR] No se encontraron roles');
            return res.status(500).send('No se encontraron roles');
        }

        console.log('[CONTROLADOR] Roles obtenidos:', roles);
        res.render('register', { 
            title: 'Regístrate', 
            roles,
            error: null 
        });
        console.log('[CONTROLADOR] Formulario de registro renderizado');
    } catch (err) {
        console.error('[CONTROLADOR] Error al obtener los roles:', err);
        res.status(500).send('Error en la base de datos');
    }
};

console.log('[CONTROLADOR] Verificando controller.register...');
controller.register = async (req, res) => {
    const { username, password, role, empresa, nit, email, aceptaPolitica, codigoSeguridad } = req.body;
    const clientIp = getClientIp(req);
    console.log('[CONTROLADOR] Formulario recibido:', { 
        username, 
        password, 
        role, 
        empresa, 
        nit, 
        email, 
        aceptaPolitica, 
        codigoSeguridad,
        ip: clientIp 
    });

    try {
        // Verificar código de seguridad
        if (!codigoSeguridad || codigoSeguridad !== CODIGO_SEGURIDAD) {
            console.log('[CONTROLADOR] Código de seguridad inválido');
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,
                error: 'Código de seguridad inválido' 
            });
        }

        // Validar contraseña
        if (!validatePassword(password)) {
            console.log('[CONTROLADOR] Contraseña no cumple con los requisitos de seguridad');
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,
                error: 'La contraseña debe tener al menos 6 caracteres, una mayúscula, una minúscula y un número.' 
            });
        }

        // Validar NIT
        if (!validateNIT(nit)) {
            console.log('[CONTROLADOR] NIT inválido');
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,
                error: 'El NIT debe contener entre 8 y 12 dígitos numéricos' 
            });
        }

        // Verificar si el usuario ya existe
        console.log('[CONTROLADOR] Verificando si el usuario ya existe');
        const [existingUsers] = await connection.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existingUsers.length > 0) {
            console.log('[CONTROLADOR] El usuario o email ya existe:', username);
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,
                error: 'El usuario o correo electrónico ya está registrado' 
            });
        }

        console.log('[CONTROLADOR] Validando campos obligatorios');
        if (!username || !password || !role || !empresa || !nit) {
            console.log('[CONTROLADOR] Faltan campos obligatorios');
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,
                error: 'Usuario, contraseña, rol, empresa y NIT son obligatorios' 
            });
        }

        console.log('[CONTROLADOR] Verificando validez del rol:', role);
        const [roleResults] = await connection.query('SELECT id, role_name FROM roles WHERE id = ?', [role]);
        if (roleResults.length === 0) {
            console.log('[CONTROLADOR] Rol no válido:', role);
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,
                error: 'Rol no válido' 
            });
        }

        const roleId = roleResults[0].id;
        const isContratista = roleResults[0].role_name.toLowerCase() === 'contratista';
        console.log('[CONTROLADOR] Rol seleccionado - ID:', roleId, 'Es contratista:', isContratista);

        if (isContratista) {
            console.log('[CONTROLADOR] Validaciones específicas para contratista');
            if (!email) {
                console.log('[CONTROLADOR] Email requerido para contratista');
                const [roles] = await connection.query('SELECT id, role_name FROM roles');
                return res.render('register', { 
                    title: 'Regístrate', 
                    roles,
                    error: 'El correo electrónico es obligatorio para contratistas' 
                });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                console.log('[CONTROLADOR] Email inválido:', email);
                const [roles] = await connection.query('SELECT id, role_name FROM roles');
                return res.render('register', { 
                    title: 'Regístrate', 
                    roles,
                    error: 'Por favor, ingrese un correo electrónico válido' 
                });
            }

            if (!aceptaPolitica) {
                console.log('[CONTROLADOR] Políticas no aceptadas');
                const [roles] = await connection.query('SELECT id, role_name FROM roles');
                return res.render('register', { 
                    title: 'Regístrate', 
                    roles,
                    error: 'Debe aceptar las políticas de tratamiento de datos' 
                });
            }
        }

        console.log('[CONTROLADOR] Hasheando contraseña');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('[CONTROLADOR] Insertando nuevo usuario en la base de datos');
        const [result] = await connection.query(
            'INSERT INTO users (username, password, role_id, empresa, nit, email) VALUES (?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, roleId, empresa, nit, email || null]
        );
        const userId = result.insertId;
        console.log('[CONTROLADOR] Usuario creado con ID:', userId, 'IP:', clientIp);

        // Para contratistas que aceptaron políticas
        if (isContratista && aceptaPolitica) {
            try {
                console.log('[CONTROLADOR] Generando documento de aceptación para contratista');
                const documentoUrl = await generateAcceptanceDocument(userId, empresa, nit, email, clientIp);
                console.log('[CONTROLADOR] Documento generado, URL:', documentoUrl);

                console.log('[CONTROLADOR] Guardando registro de aceptación en BD');
                await connection.execute(
                    'INSERT INTO politicas_aceptadas (usuario_id, fecha_aceptacion, ip_aceptacion, documento_url) VALUES (?, NOW(), ?, ?)',
                    [userId, clientIp || 'No disponible', documentoUrl]
                );

                console.log('[CONTROLADOR] Enviando correo de aceptación');
                await emailService.sendAcceptanceEmail(email, empresa, documentoUrl);
                console.log('[CONTROLADOR] Correo de aceptación enviado exitosamente');
            } catch (policyError) {
                console.error('[CONTROLADOR] Error procesando la aceptación de políticas:', policyError);
                // Continuamos con la redirección a login aunque falle
            }
        }

        console.log('[CONTROLADOR] Redirigiendo a /login');
        res.redirect('/login');
    } catch (err) {
        console.error('[CONTROLADOR] Error al registrar el usuario:', err);
        try {
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            res.render('register', { 
                title: 'Regístrate', 
                roles,
                error: 'Error al registrar el usuario'
            });
        } catch (rolesError) {
            console.error('[CONTROLADOR] Error adicional al obtener roles:', rolesError);
            res.status(500).send('Error en el servidor al procesar el registro');
        }
    }
};

async function generateAcceptanceDocument(userId, empresa, nit, email, ip) {
    try {
        console.log('[CONTROLADOR] Generando documento HTML de aceptación');
        const templateContent = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Constancia de Aceptación</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .container { max-width: 800px; margin: 0 auto; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .content { border: 1px solid #ddd; padding: 20px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Constancia de Aceptación</h1>
                    </div>
                    <div class="content">
                        <p><strong>Usuario ID:</strong> {{userId}}</p>
                        <p><strong>Empresa:</strong> {{empresa}}</p>
                        <p><strong>NIT:</strong> {{nit}}</p>
                        <p><strong>Email:</strong> {{email}}</p>
                        <p><strong>Fecha:</strong> {{fecha}}</p>
                        <p><strong>IP:</strong> {{ip}}</p>
                        <p>El usuario ha aceptado las políticas de tratamiento de datos establecidas en ${process.env.DOMAIN_URL}/politica-tratamiento-datos</p>
                    </div>
                    <div class="footer">
                        <p>Documento generado electrónicamente</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        console.log('[CONTROLADOR] Compilando plantilla Handlebars');
        const template = handlebars.compile(templateContent);
        const html = template({
            userId,
            empresa,
            nit,
            email,
            fecha: format(new Date(), 'dd/MM/yyyy HH:mm:ss'),
            ip
        });

        console.log('[CONTROLADOR] Convirtiendo HTML a buffer');
        const buffer = Buffer.from(html, 'utf-8');
        const filename = `aceptaciones/${userId}_${Date.now()}.html`;
        console.log('[CONTROLADOR] Nombre del archivo generado:', filename);

        console.log('[CONTROLADOR] Subiendo archivo a DigitalOcean Spaces');
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: 'gestion-contratistas-os',
                Key: filename,
                Body: buffer,
                ContentType: 'text/html',
                ACL: 'public-read'
            }
        });

        const result = await upload.done();
        const url = `https://gestion-contratistas-os.nyc3.digitaloceanspaces.com/${filename}`;
        console.log('[CONTROLADOR] Archivo subido exitosamente, URL:', url);
        return url;
    } catch (error) {
        console.error('[CONTROLADOR] Error generando documento:', error);
        throw error;
    }
}

module.exports = controller;