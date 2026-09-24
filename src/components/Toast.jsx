export default function Toast({ msg, type, visible }) {
  return (
    <div className={`toast ${type}${visible ? ' show' : ''}`}>
      <i className={type === 'error' ? 'fas fa-times-circle' : 'fas fa-check-circle'} />
      <span>{msg}</span>
    </div>
  )
}
