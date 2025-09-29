export async function getStationNameById(stationId) {
  try {
    const response = await fetch('/api/db/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: 'SELECT name FROM stations WHERE id = ?',
        params: [stationId],
      }),
    });

    if (!response.ok) {
      throw new Error(`Erreur API: ${response.statusText}`);
    }

    const { success, data } = await response.json();
    if (success && data.length > 0) {
      return data[0].name;
    }
    return null;
  } catch (error) {
    console.error(`Erreur lors de la récupération de la gare avec l'ID ${stationId}:`, error);
    return null;
  }
}
