const express = require('express');
const controller = require('../controllers/sst.controller');  // Importamos el controlador

const router = express.Router();

// Aplicar middleware de limpieza a todas las rutas que manejan archivos
router.use(controller.cleanupMiddleware);

router.get('/api/sst/colaboradores/:solicitudId', controller.getColaboradores);
router.get('/api/sst/solicitudes/:solicitudId', controller.getSolicitudDetails);
router.get('/api/sst/vehiculos/:solicitudId', controller.getVehiculos);
router.get('/api/sst/plantilla-ss/:documentoId', controller.getPlantillaSS);
router.post('/api/sst/plantilla-ss', controller.guardarOActualizarPlantillaSS);
router.put('/api/sst/plantilla-ss', controller.guardarOActualizarPlantillaSS);
router.get('/api/sst/historial-cursos/:colaboradorId', controller.getHistorialCursos);
router.post('/api/filtrar-solicitudes-sst', controller.filtrarSolicitudesSst);
router.get('/api/sst/filtrar-solicitudes', controller.filtrarSolicitudesSst);

// Rutas para gestión de documentos de vehículos
router.get('/api/sst/vehiculo-documento/:vehiculoId/:tipoDocumento', controller.getVehiculoDocumento);
router.post('/api/sst/vehiculo-documento', controller.saveVehiculoDocumento);
router.put('/api/sst/vehiculo-documento', controller.saveVehiculoDocumento);
router.post('/api/sst/toggle-licencia', controller.toggleLicencia);

// Verificación de que la función 'vistaSst' está definida en el controlador
console.log('Verificando controller.vistaSst...');
if (typeof controller.vistaSst !== 'function') {
  console.error('controller.vistaSst no es una función o está undefined');
} else {
  // Si controller.vistaSst es una función válida, se añade la ruta
  router.get('/vista-sst', async (req, res) => {
    try {
      console.log('[RUTAS] Accediendo a la vista de SST');
      await controller.vistaSst(req, res);
    } catch (err) {
      console.error('[RUTAS] Error al acceder a la vista de SST:', err);
      res.status(500).send('Error al acceder a la vista de solicitudes SST');
    }
  });
}

// Verificación de que la función 'aprobarSolicitud' está definida en el controlador
console.log('Verificando controller.aprobarSolicitud...');
if (typeof controller.aprobarSolicitud !== 'function') {
  console.error('controller.aprobarSolicitud no es una función o está undefined');
} else {
  // Si controller.aprobarSolicitud es una función válida, se añade la ruta
  router.post('/aprobar-solicitud/:id', async (req, res) => {
    try {
      console.log('[RUTAS] Aprobando solicitud con ID:', req.params.id);
      await controller.aprobarSolicitud(req, res);
    } catch (err) {
      console.error('[RUTAS] Error al aprobar la solicitud:', err);
      res.status(500).send('Error al aprobar la solicitud');
    }
  });
}

// Verificación de que la función 'negarSolicitud' está definida en el controlador
console.log('Verificando controller.negarSolicitud...');
if (typeof controller.negarSolicitud !== 'function') {
  console.error('controller.negarSolicitud no es una función o está undefined');
} else {
  // Si controller.negarSolicitud es una función válida, se añade la ruta
  router.post('/negar-solicitud/:id', async (req, res) => {
    try {
      console.log('[RUTAS] Negando solicitud con ID:', req.params.id);
      await controller.negarSolicitud(req, res);
    } catch (err) {
      console.error('[RUTAS] Error al negar la solicitud:', err);
      res.status(500).send('Error al negar la solicitud');
    }
  });
}

// Verificación de que la función 'mostrarNegarSolicitud' está definida en el controlador
console.log('Verificando controller.mostrarNegarSolicitud...');
if (typeof controller.mostrarNegarSolicitud !== 'function') {
  console.error('controller.mostrarNegarSolicitud no es una función o está undefined');
} else {
  // Si controller.mostrarNegarSolicitud es una función válida, se añade la ruta
  router.get('/negar-solicitud/:id', async (req, res) => {
    try {
      console.log('[RUTAS] Mostrando detalles para negar solicitud con ID:', req.params.id);
      await controller.mostrarNegarSolicitud(req, res);
    } catch (err) {
      console.error('[RUTAS] Error al mostrar detalles de la solicitud para negar:', err);
      res.status(500).send('Error al mostrar detalles de la solicitud para negar');
    }
  });
}

// Verificación de que la función 'descargarSolicitud' está definida en el controlador
console.log('Verificando controller.descargarSolicitud...');
if (typeof controller.descargarSolicitud !== 'function') {
  console.error('controller.descargarSolicitud no es una función o está undefined');
} else {
  // Si controller.descargarSolicitud es una función válida, se añade la ruta
  router.get('/api/sst/descargar-documentos/:solicitudId', controller.descargarSolicitud);
}

// Ruta para generar documentos
router.post('/api/sst/generar-documentos/:id', controller.generarDocumentos);

module.exports = router;
