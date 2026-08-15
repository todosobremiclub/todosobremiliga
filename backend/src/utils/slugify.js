// Convierte "Liga Regional de Futbol" en "liga-regional-de-futbol"
// Se usa para armar el slug de una Liga automaticamente si no se manda uno.
function slugify(texto) {
  return texto
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca tildes (marcas diacriticas)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

module.exports = { slugify };
