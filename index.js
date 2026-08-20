// Utilidad para pruebas de conexión con Firebase (disponible de forma global)
window.probarConexionFirebase = async function() {
  try {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
      console.warn('Firebase no está inicializado todavía.');
      return { success: false, message: 'Firebase no inicializado' };
    }
    const db = firebase.firestore();
    const docRef = await db.collection('pruebas').add({
      mensaje: "¡Página web conectada a Firebase exitosamente!",
      fecha: new Date()
    });
    console.log('¡Éxito! Documento guardado en Firestore con ID:', docRef.id);
    return { success: true, id: docRef.id };
  } catch (error) {
    console.warn('Aviso sobre conexión a Firestore:', error.message);
    return { success: false, error: error.message };
  }
};
