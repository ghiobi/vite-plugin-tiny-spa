import { useMemo, useState } from 'react'
import { highlight } from 'sugar-high'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const snippet = useMemo(
    () =>
      highlight(`function App() {
  const [count, setCount] = useState(${count})

  return (
    <main>
      <h1>Hello world!</h1>
      <button onClick={() => setCount(count + 1)}>
        Count is {count}
      </button>
    </main>
  )
}`),
    [count],
  )

  return (
    <main className="card">
      <p className="eyebrow">vite-plugin-tiny-spa + React</p>
      <h1>Small single-file counter</h1>
      <p>
        React, React DOM, and sugar-high are imported from esm.sh, leaving this
        device-hosted app shell tiny.
      </p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Count is {count}
      </button>
      <pre aria-label="Highlighted App source">
        <code dangerouslySetInnerHTML={{ __html: snippet }} />
      </pre>
    </main>
  )
}

export default App
