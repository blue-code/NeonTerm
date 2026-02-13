// ... inside render > SFTP view
                <div style={{ padding: 10, borderBottom: '1px solid #333', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span title={currentPath} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{currentPath}</span>
                  <div title="Drag files here">
                    <Upload size={14} />
                  </div>
                </div>
// ...