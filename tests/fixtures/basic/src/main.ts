import { highlight } from 'sugar-high'
import logoUrl from './logo.svg'
import pixelUrl from './pixel.png'
import './style.css'

const code = `const target = 'esp32'\nconsole.log(target)`

const app = document.querySelector<HTMLElement>('#app')
if (!app) {
  throw new Error('Fixture root element was not found')
}

app.innerHTML = `
  <h1>tiny spa fixture</h1>
  <img src="${logoUrl}" alt="fixture logo" />
  <img src="${pixelUrl}" alt="fixture pixel" />
  <pre><code>${highlight(code)}</code></pre>
`
