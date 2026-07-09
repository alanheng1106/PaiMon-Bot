const { getAverageColor } = require('fast-average-color-node');
getAverageColor('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    .then(color => console.log('Color:', color.hex))
    .catch(err => console.error('Error:', err.message));
