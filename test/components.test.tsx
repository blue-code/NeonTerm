import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionManager } from '../src/components/SessionManager'
import { ViCheatSheet } from '../src/components/ViCheatSheet'
import React from 'react'

// Mock Lucide icons to avoid SVG render issues in test env
// IMPORTANT: Pass props to the mock so onClick handlers work!
vi.mock('lucide-react', () => ({
  Folder: (props) => <span data-testid="icon-folder" {...props} />,
  Monitor: (props) => <span data-testid="icon-monitor" {...props} />,
  Trash2: (props) => <span data-testid="icon-trash" {...props} />,
  Edit: (props) => <span data-testid="icon-edit" {...props} />,
  ChevronRight: (props) => <span data-testid="icon-chevron-right" {...props} />,
  ChevronDown: (props) => <span data-testid="icon-chevron-down" {...props} />,
  Plus: (props) => <span data-testid="icon-plus" {...props} />,
  Download: (props) => <span data-testid="icon-download" {...props} />,
  Upload: (props) => <span data-testid="icon-upload" {...props} />,
  X: (props) => <span data-testid="icon-x" {...props} />,
}))

describe('SessionManager', () => {
  const mockSessions = {
    groups: [
      {
        name: 'AWS Servers',
        sessions: [
          { id: 1, name: 'Prod-1', host: '1.2.3.4' },
          { id: 2, name: 'Dev-1', host: '1.2.3.5' }
        ]
      }
    ]
  }

  it('renders session groups', () => {
    render(
      <SessionManager 
        sessions={mockSessions} 
        onConnect={() => {}} 
        onSave={() => {}} 
        onDelete={() => {}} 
        onImport={() => {}} 
        onExport={() => {}} 
      />
    )
    expect(screen.getByText('AWS Servers')).toBeTruthy()
  })

  it('expands group on click', () => {
    render(
      <SessionManager 
        sessions={mockSessions} 
        onConnect={() => {}} 
        onSave={() => {}} 
        onDelete={() => {}} 
        onImport={() => {}} 
        onExport={() => {}} 
      />
    )
    
    // Click group name
    fireEvent.click(screen.getByText('AWS Servers'))
    
    // Check if sessions appear
    expect(screen.getByText('Prod-1')).toBeTruthy()
    expect(screen.getByText('Dev-1')).toBeTruthy()
  })
})

describe('ViCheatSheet', () => {
  it('renders command list', () => {
    render(<ViCheatSheet onClose={() => {}} />)
    expect(screen.getByText('Vi Cheat Sheet')).toBeTruthy()
    expect(screen.getByText(':wq')).toBeTruthy() // Save & Quit command
  })

  it('calls onClose when close button clicked', () => {
    const handleClose = vi.fn()
    render(<ViCheatSheet onClose={handleClose} />)
    
    const closeBtn = screen.getByTestId('icon-x')
    fireEvent.click(closeBtn)
    
    expect(handleClose).toHaveBeenCalled()
  })
})
